import type { SensorReading } from './types';

const MQTT_BROKER = process.env.NEXT_PUBLIC_MQTT_BROKER || 'mqtt://broker.hivemq.com:1883';

interface MQTTCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onDataReceived?: (reading: Partial<SensorReading>) => void;
  onError?: (error: Error) => void;
}

export class MQTTClient {
  private brokerUrl: string;
  private callbacks: MQTTCallbacks = {};
  private isConnected: boolean = false;
  private isWebSocketSupported: boolean = false;

  constructor() {
    this.brokerUrl = MQTT_BROKER;
    this.isWebSocketSupported = typeof window !== 'undefined';
  }

  async initialize(callbacks: MQTTCallbacks): Promise<void> {
    this.callbacks = callbacks;

    if (!this.isWebSocketSupported) {
      console.warn('MQTT not available in non-browser environment');
      return;
    }

    // Note: In production, use mqtt.js with WebSocket support
    // This is a placeholder for MQTT client initialization
    try {
      this.isConnected = true;
      this.callbacks.onConnect?.();
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error : new Error('Connection failed'));
    }
  }

  subscribe(): void {
    if (!this.isWebSocketSupported) return;

    const topics = [
      'crop/sensor/moisture',
      'crop/sensor/temperature',
      'crop/sensor/humidity',
      'crop/sensor/light',
    ];

    // In production, implement actual MQTT.js client:
    // topics.forEach(topic => {
    //   this.client.subscribe(topic, (err) => {
    //     if (err) this.callbacks.onError?.(err);
    //   });
    // });

    // For now, simulate with placeholder
    this.simulateSensorData();
  }

  private simulateSensorData(): void {
    // Simulate real-time data for demo purposes
    const interval = setInterval(() => {
      if (!this.isConnected) {
        clearInterval(interval);
        return;
      }

      const reading: Partial<SensorReading> = {
        moisture: 45 + Math.random() * 20,
        temperature: 22 + Math.random() * 8,
        humidity: 55 + Math.random() * 25,
        light: 300 + Math.random() * 700,
        timestamp: new Date(),
      };

      this.callbacks.onDataReceived?.(reading);
    }, 5000);
  }

  disconnect(): void {
    this.isConnected = false;
    this.callbacks.onDisconnect?.();
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

export const mqttClient = new MQTTClient();
