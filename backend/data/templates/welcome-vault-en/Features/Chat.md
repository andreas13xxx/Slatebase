---
tags: [features]
---

# Chat

Slatebase includes a built-in messaging system for communication between users on the same instance. No external tools needed.

![[Screenshots/chat-ansicht.png]]

*The chat view with conversations*

---

## Opening Chat

| Method | Description |
|--------|-------------|
| User menu | Click avatar → Chat |
| Command Palette | Search for "Chat" |

The chat opens as a full-page view with two panels: conversation list and messages.

---

## Conversations

### Creating a Conversation

1. Click **New Conversation** in the conversation list
2. Search for and select users to include
3. Enter an optional title
4. Start writing messages

### Leaving a Conversation

Right-click on a conversation → **Leave**. You'll no longer receive messages from this conversation.

### Archiving

Conversations you've left appear as archived. You can still view them but won't receive new message notifications.

---

## Messages

### Sending Messages

1. Type your message in the input field at the bottom
2. Press Enter to send
3. Messages appear in real-time for all participants

### Message Features

- **Markdown support** — Messages support basic Markdown formatting
- **Rate limiting** — To prevent spam, there's a brief cooldown between messages

---

## Unread Badges

Unread message counts appear as badges:
- On the Chat menu item
- Next to each conversation in the list

Opening a conversation marks its messages as read.

---

## Real-Time Updates

Messages are delivered instantly via Server-Sent Events (SSE). You don't need to refresh — new messages appear automatically.

---

> [!tip] When to Use Chat
> Chat is ideal for quick questions and coordination between team members. For longer discussions or knowledge that should be preserved, create a shared vault or link to notes instead.

> [!todo] Exercise
> 1. Open the Chat via the user menu
> 2. If other users exist on your instance, create a test conversation
> 3. Send a message and observe real-time delivery

---

## Related Features

- [[Features/Vault Management]] — Sharing vaults with other users
- [[Features/Settings]] — Admin can enable/disable chat via feature toggle
