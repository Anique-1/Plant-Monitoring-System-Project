import logging
from datetime import datetime
from app.database import Database
from app.models import Alert, AlertType, AlertSeverity, SensorReading
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)


class AlertService:
    """Service for managing alerts and threshold checking"""
    
    def __init__(self):
        self.email_service = EmailService()
    
    async def check_and_create_alerts(self, sensor_reading: SensorReading):
        """Check sensor readings against thresholds and create alerts"""
        try:
            db = Database.get_db()
            
            # Get current settings
            settings_doc = await db.settings.find_one({"setting_type": "system"})
            if not settings_doc:
                logger.warning("⚠️ No system settings found, skipping threshold check")
                return
            
            thresholds = settings_doc.get("thresholds", {})
            email_settings = settings_doc.get("email_settings", {})
            
            alerts_to_create = []
            
            # Check soil moisture
            if sensor_reading.soil_moisture < thresholds.get("soil_moisture_min", 30):
                alerts_to_create.append({
                    "alert_type": AlertType.SOIL_MOISTURE_LOW,
                    "severity": AlertSeverity.WARNING,
                    "message": f"Soil moisture ({sensor_reading.soil_moisture}%) is below minimum threshold",
                    "sensor_value": sensor_reading.soil_moisture,
                    "threshold_value": thresholds.get("soil_moisture_min", 30)
                })
            elif sensor_reading.soil_moisture > thresholds.get("soil_moisture_max", 70):
                alerts_to_create.append({
                    "alert_type": AlertType.SOIL_MOISTURE_HIGH,
                    "severity": AlertSeverity.WARNING,
                    "message": f"Soil moisture ({sensor_reading.soil_moisture}%) is above maximum threshold",
                    "sensor_value": sensor_reading.soil_moisture,
                    "threshold_value": thresholds.get("soil_moisture_max", 70)
                })
            
            # Check temperature
            if sensor_reading.temperature < thresholds.get("temperature_min", 15):
                alerts_to_create.append({
                    "alert_type": AlertType.TEMPERATURE_LOW,
                    "severity": AlertSeverity.WARNING,
                    "message": f"Temperature ({sensor_reading.temperature}°C) is below minimum threshold",
                    "sensor_value": sensor_reading.temperature,
                    "threshold_value": thresholds.get("temperature_min", 15)
                })
            elif sensor_reading.temperature > thresholds.get("temperature_max", 35):
                alerts_to_create.append({
                    "alert_type": AlertType.TEMPERATURE_HIGH,
                    "severity": AlertSeverity.CRITICAL if sensor_reading.temperature > 40 else AlertSeverity.WARNING,
                    "message": f"Temperature ({sensor_reading.temperature}°C) is above maximum threshold",
                    "sensor_value": sensor_reading.temperature,
                    "threshold_value": thresholds.get("temperature_max", 35)
                })
            
            # Check humidity
            if sensor_reading.humidity < thresholds.get("humidity_min", 40):
                alerts_to_create.append({
                    "alert_type": AlertType.HUMIDITY_LOW,
                    "severity": AlertSeverity.INFO,
                    "message": f"Humidity ({sensor_reading.humidity}%) is below minimum threshold",
                    "sensor_value": sensor_reading.humidity,
                    "threshold_value": thresholds.get("humidity_min", 40)
                })
            elif sensor_reading.humidity > thresholds.get("humidity_max", 80):
                alerts_to_create.append({
                    "alert_type": AlertType.HUMIDITY_HIGH,
                    "severity": AlertSeverity.WARNING,
                    "message": f"Humidity ({sensor_reading.humidity}%) is above maximum threshold",
                    "sensor_value": sensor_reading.humidity,
                    "threshold_value": thresholds.get("humidity_max", 80)
                })
            
            # Check light intensity
            if sensor_reading.light_intensity < thresholds.get("light_intensity_min", 5000):
                alerts_to_create.append({
                    "alert_type": AlertType.LIGHT_INTENSITY_LOW,
                    "severity": AlertSeverity.INFO,
                    "message": f"Light intensity ({sensor_reading.light_intensity} Lux) is below minimum threshold",
                    "sensor_value": sensor_reading.light_intensity,
                    "threshold_value": thresholds.get("light_intensity_min", 5000)
                })
            elif sensor_reading.light_intensity > thresholds.get("light_intensity_max", 50000):
                alerts_to_create.append({
                    "alert_type": AlertType.LIGHT_INTENSITY_HIGH,
                    "severity": AlertSeverity.WARNING,
                    "message": f"Light intensity ({sensor_reading.light_intensity} Lux) is above maximum threshold",
                    "sensor_value": sensor_reading.light_intensity,
                    "threshold_value": thresholds.get("light_intensity_max", 50000)
                })
            
            # Create alerts and send emails
            for alert_data in alerts_to_create:
                alert = Alert(**alert_data, timestamp=datetime.utcnow())
                
                # Save alert to database
                alert_dict = alert.model_dump(exclude={"id"})
                result = await db.alerts.insert_one(alert_dict)
                logger.info(f"🚨 Alert created: {alert.alert_type.value}")
                
                # Send email if enabled
                if email_settings.get("enabled", False) and email_settings.get("email"):
                    email_sent = await self.email_service.send_alert_email(
                        alert, 
                        email_settings["email"]
                    )
                    
                    # Update alert with email status
                    await db.alerts.update_one(
                        {"_id": result.inserted_id},
                        {"$set": {"email_sent": email_sent}}
                    )
        
        except Exception as e:
            logger.error(f"❌ Error in alert service: {e}")
    
    async def get_recent_alerts(self, limit: int = 10):
        """Get recent alerts"""
        try:
            db = Database.get_db()
            cursor = db.alerts.find().sort("timestamp", -1).limit(limit)
            alerts = await cursor.to_list(length=limit)
            return alerts
        except Exception as e:
            logger.error(f"❌ Error getting recent alerts: {e}")
            return []
    
    async def resolve_alert(self, alert_id: str):
        """Mark alert as resolved"""
        try:
            db = Database.get_db()
            from bson import ObjectId
            
            result = await db.alerts.update_one(
                {"_id": ObjectId(alert_id)},
                {
                    "$set": {
                        "is_resolved": True,
                        "resolved_at": datetime.utcnow()
                    }
                }
            )
            
            if result.modified_count > 0:
                logger.info(f"✅ Alert {alert_id} resolved")
                return True
            return False
            
        except Exception as e:
            logger.error(f"❌ Error resolving alert: {e}")
            return False
