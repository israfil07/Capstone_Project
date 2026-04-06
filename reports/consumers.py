from importlib import import_module

from asgiref.sync import sync_to_async


class _FallbackChannelLayer:
    async def group_add(self, group_name, channel_name):
        return None

    async def group_discard(self, group_name, channel_name):
        return None


class _FallbackAsyncJsonWebsocketConsumer:
    # Fallback keeps imports safe in environments where Channels is not installed.
    scope = {}
    channel_name = ""
    channel_layer = _FallbackChannelLayer()

    async def close(self):
        return None

    async def accept(self):
        return None

    async def send_json(self, content):
        return None


def _load_channels_symbol(module_name, symbol_name):
    try:
        module = import_module(module_name)
    except ImportError:
        return None
    return getattr(module, symbol_name, None)


database_sync_to_async = _load_channels_symbol("channels.db", "database_sync_to_async") or sync_to_async
AsyncJsonConsumerBase = (
    _load_channels_symbol("channels.generic.websocket", "AsyncJsonWebsocketConsumer")
    or _FallbackAsyncJsonWebsocketConsumer
)

from .models import Notification
from .realtime import notification_group_name


class NotificationConsumer(AsyncJsonConsumerBase):  # type: ignore[misc]
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close()
            return

        self.user_id = user.id
        self.group_name = notification_group_name(self.user_id)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        unread_count = await self.get_unread_count()
        await self.send_json(
            {
                "type": "count",
                "unread_count": unread_count,
            }
        )

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def notifications_update(self, event):
        await self.send_json(
            {
                "type": "count",
                "unread_count": event.get("unread_count", 0),
            }
        )

    async def notifications_new(self, event):
        await self.send_json(
            {
                "type": "new",
                "message": event.get("message", ""),
                "report_id": event.get("report_id"),
                "unread_count": event.get("unread_count", 0),
            }
        )

    @database_sync_to_async
    def get_unread_count(self):
        return Notification.objects.filter(recipient_id=self.user_id, is_read=False).count()
