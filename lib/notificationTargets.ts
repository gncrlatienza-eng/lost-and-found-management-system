export type NotificationTarget = {
  kind: 'lost' | 'found';
  id: string;
};

const TARGET_TOKEN_REGEX = /\s*\[\[report:(lost|found):([A-Za-z0-9-]+)\]\]\s*$/;

export function parseNotificationTarget(message: string): NotificationTarget | null {
  const match = message.match(TARGET_TOKEN_REGEX);
  if (!match) return null;

  const [, kind, id] = match;
  if (!id) return null;

  return {
    kind: kind as NotificationTarget['kind'],
    id,
  };
}

export function stripNotificationTarget(message: string): string {
  return message.replace(TARGET_TOKEN_REGEX, '').trim();
}

export function attachNotificationTarget(message: string, target: NotificationTarget): string {
  return `${stripNotificationTarget(message)} [[report:${target.kind}:${target.id}]]`;
}
