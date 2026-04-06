from asgiref.sync import async_to_sync
from importlib import import_module

from .models import Notification


def notification_group_name(user_id):
    return f"notifications_user_{user_id}"


def _get_channel_layer():
    """Return Channels' get_channel_layer if Channels is installed."""
    try:
        channels_layers = import_module("channels.layers")
    except ImportError:
        return None
    return getattr(channels_layers, "get_channel_layer", None)


def _send_group_event(user_id, event):
    get_channel_layer = _get_channel_layer()
    if get_channel_layer is None:
        return
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    async_to_sync(channel_layer.group_send)(notification_group_name(user_id), event)


def broadcast_unread_count(user_id):
    unread_count = Notification.objects.filter(recipient_id=user_id, is_read=False).count()
    _send_group_event(
        user_id,
        {
            "type": "notifications.update",
            "unread_count": unread_count,
        },
    )


def broadcast_new_notification(notification):
    unread_count = Notification.objects.filter(
        recipient_id=notification.recipient_id,
        is_read=False,
    ).count()
    _send_group_event(
        notification.recipient_id,
        {
            "type": "notifications.new",
            "message": notification.message,
            "report_id": notification.report_id,
            "unread_count": unread_count,
        },
    )
