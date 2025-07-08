export default {
  async fetch(request, env) {
    return await handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  const [client, server] = Object.values(new WebSocketPair());
  await handleWebSocket(server, env);
  return new Response(null, {
    status: 101,
    webSocket: client
  });
}

const clients = new Set();

async function handleWebSocket(websocket, env) {
  websocket.accept();
  clients.add(websocket);

  // Enviar historial de mensajes al conectar
  const messages = await env.KV_CHAT.get('messages', { type: 'json' }) || [];
  websocket.send(JSON.stringify({ history: messages }));

  websocket.addEventListener('message', async ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.type === 'message') {
      const messageData = { user: msg.user, message: msg.message, timestamp: Date.now() };
      messages.push(messageData);
      await env.KV_CHAT.put('messages', JSON.stringify(messages));
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(messageData));
        }
      }
    }
  });

  websocket.addEventListener('close', () => {
    clients.delete(websocket);
  });
}