'use client';

import { useEffect, useState } from 'react';
import { Droplet, Thermometer, Cloud, Sun } from 'lucide-react';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { SensorChart } from '@/components/dashboard/SensorChart';
import { AlertPanel } from '@/components/dashboard/AlertPanel';
import { StatusIndicator } from '@/components/dashboard/StatusIndicator';
import { useSensorContext } from '@/lib/context';
import { apiClient } from '@/lib/api';
import { mqttClient } from '@/lib/mqtt';
import type { SensorReading, Alert, ChartDataPoint } from '@/lib/types';

export default function DashboardPage() {
  const { currentReading, recentAlerts, updateSensorReading, addAlert } = useSensorContext();
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize MQTT connection
    mqttClient.initialize({
      onConnect: () => {
        setIsConnected(true);
        mqttClient.subscribe();
      },
      onDisconnect: () => setIsConnected(false),
      onDataReceived: (reading) => {
        updateSensorReading({
          ...(currentReading || {
            moisture: 0,
            temperature: 0,
            humidity: 0,
            light: 0,
            timestamp: new Date(),
          }),
          ...reading,
        } as SensorReading);

        // Add to chart data
        setChartData((prev) => {
          const newPoint: ChartDataPoint = {
            timestamp: new Date().toLocaleTimeString(),
            moisture: reading.moisture,
            temperature: reading.temperature,
            humidity: reading.humidity,
            light: reading.light,
          };
          return [...prev.slice(-95), newPoint]; // Keep last 96 points
        });
      },
      onError: (error) => console.error('MQTT Error:', error),
    });

    // Fetch initial data
    const fetchInitialData = async () => {
      try {
        const [currentData, historyData] = await Promise.all([
          apiClient.getCurrentSensorData(),
          apiClient.getSensorHistory(24),
        ]);

        if (currentData) {
          // Map backend field names to frontend
          updateSensorReading({
            moisture: currentData.soil_moisture,
            temperature: currentData.temperature,
            humidity: currentData.humidity,
            light: currentData.light_intensity,
            timestamp: new Date(currentData.timestamp),
          });
        }

        if (historyData && Array.isArray(historyData)) {
          const formatted = historyData.map((point: any) => ({
            timestamp: new Date(point.timestamp).toLocaleTimeString(),
            moisture: point.soil_moisture,
            temperature: point.temperature,
            humidity: point.humidity,
            light: point.light_intensity,
          }));
          setChartData(formatted);
        }
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();

    return () => {
      mqttClient.disconnect();
    };
  }, []);

  // Fetch alerts periodically
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const alerts = await apiClient.getAlerts(10);
        if (Array.isArray(alerts)) {
          alerts.slice(0, 1).forEach((alert: any) => {
            addAlert({
              ...alert,
              timestamp: new Date(alert.timestamp),
            });
          });
        }
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
      }
    };

    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, []);

  const getDemoStatus = (value: number, type: string) => {
    const thresholds = {
      moisture: { warning: 30, critical: 20 },
      temperature: { warning: 30, critical: 35 },
      humidity: { warning: 30, critical: 80 },
      light: { warning: 200, critical: 100 },
    };

    const t = thresholds[type as keyof typeof thresholds];
    if (value < t.critical || value > t.critical) return 'critical' as const;
    if (value < t.warning || value > t.warning) return 'warning' as const;
    return 'good' as const;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Real-time sensor monitoring and system status</p>
        </div>
        <StatusIndicator isConnected={isConnected} />
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Soil Moisture"
            value={currentReading?.moisture.toFixed(1) ?? 0}
            unit="%"
            icon={<Droplet className="h-6 w-6 text-primary" />}
            status={getDemoStatus(currentReading?.moisture ?? 0, 'moisture')}
            lastUpdated={currentReading?.timestamp}
            sparklineData={[40, 45, 42, 48, 50, 45, 48, 52]}
          />
          <MetricCard
            title="Temperature"
            value={currentReading?.temperature.toFixed(1) ?? 0}
            unit="°C"
            icon={<Thermometer className="h-6 w-6 text-orange-500" />}
            status={getDemoStatus(currentReading?.temperature ?? 0, 'temperature')}
            lastUpdated={currentReading?.timestamp}
            sparklineData={[60, 62, 61, 63, 65, 62, 64, 66]}
          />
          <MetricCard
            title="Humidity"
            value={currentReading?.humidity.toFixed(1) ?? 0}
            unit="%"
            icon={<Cloud className="h-6 w-6 text-cyan-500" />}
            status={getDemoStatus(currentReading?.humidity ?? 0, 'humidity')}
            lastUpdated={currentReading?.timestamp}
            sparklineData={[50, 55, 52, 58, 60, 55, 58, 62]}
          />
          <MetricCard
            title="Light Intensity"
            value={currentReading?.light.toFixed(0) ?? 0}
            unit="lux"
            icon={<Sun className="h-6 w-6 text-yellow-500" />}
            status={getDemoStatus(currentReading?.light ?? 0, 'light')}
            lastUpdated={currentReading?.timestamp}
            sparklineData={[30, 35, 32, 38, 40, 35, 38, 42]}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SensorChart data={chartData} isLoading={isLoading} />
        </div>
        <AlertPanel alerts={recentAlerts} />
      </div>
    </div>
  );
}
