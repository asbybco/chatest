export default {
  async fetch(request, env) {
    return await handleRequest(request, env);
  }
};

class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Set();
  }

  async handleSession(websocket) {
    websocket.accept();
    this.clients.add(websocket);

    // Enviar historial de mensajes desde KV
    const messages = await this.env.KV_CHAT.get('messages', { type: 'json' }) || [];
    websocket.send(JSON.stringify({ history: messages }));

    websocket.addEventListener('message', async ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.type === 'message') {
        const messageData = { user: msg.user, message: msg.message, timestamp: Date.now() };
        const messages = (await this.env.KV_CHAT.get('messages', { type: 'json' })) || [];
        messages.push(messageData);
        await this.env.KV_CHAT.put('messages', JSON.stringify(messages));
        for (const client of this.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(messageData));
          }
        }
      }
    });

    websocket.addEventListener('close', () => {
      this.clients.delete(websocket);
    });
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    await this.handleSession(server);
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
}

async function handleRequest(request, env) {
  const id = env.CHAT_ROOM.idFromName('chat');
  const durableObject = env.CHAT_ROOM.get(id);
  return await durableObject.fetch(request);
}