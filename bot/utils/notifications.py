"""
Notification utilities for achievements and events
"""
import logging
from typing import Optional, Dict, Any

from settings import get_settings

logger = logging.getLogger(__name__)


async def send_achievement_notification(user_email: str, achievement_name: str) -> bool:
    """
    Send notification about unlocked achievement
    
    Currently logs the notification. In production, this could:
    - Send email via SMTP/SendGrid
    - Send push notification via Firebase/OneSignal
    - Send webhook to external service
    
    Returns True if notification was sent successfully
    """
    try:
        # Log achievement unlock
        logger.info(f"Achievement unlocked: {user_email} - {achievement_name}")
        
        # Check if email notifications are enabled
        email_enabled = get_settings().email_notifications_enabled
        
        if email_enabled:
            # In production, implement email sending here
            # Example: await send_email(user_email, f"Достижение разблокировано: {achievement_name}")
            logger.info(f"Email notification would be sent to {user_email} for achievement: {achievement_name}")
        
        # Check if push notifications are enabled
        push_enabled = get_settings().push_notifications_enabled
        
        if push_enabled:
            # In production, implement push notification here
            # Example: await send_push_notification(user_id, f"Достижение: {achievement_name}")
            logger.info(f"Push notification would be sent for achievement: {achievement_name}")
        
        return True
    except Exception as e:
        logger.error(f"Error sending achievement notification: {e}", exc_info=True)
        return False


async def send_streak_notification(user_email: str, streak_days: int) -> bool:
    """
    Send notification about streak milestone
    
    Returns True if notification was sent successfully
    """
    try:
        logger.info(f"Streak milestone: {user_email} - {streak_days} days")
        
        # Only notify on milestones (7, 30, 100 days)
        if streak_days in [7, 30, 100]:
            logger.info(f"Streak milestone notification: {user_email} reached {streak_days} days")
            # In production, send notification here
        
        return True
    except Exception as e:
        logger.error(f"Error sending streak notification: {e}", exc_info=True)
        return False


async def send_league_promotion_notification(user_email: str, old_league: str, new_league: str) -> bool:
    """
    Send notification about league promotion
    
    Returns True if notification was sent successfully
    """
    try:
        logger.info(f"League promotion: {user_email} - {old_league} -> {new_league}")
        # In production, send notification here
        return True
    except Exception as e:
        logger.error(f"Error sending league promotion notification: {e}", exc_info=True)
        return False

