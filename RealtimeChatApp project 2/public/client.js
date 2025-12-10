// client.js - React app (no build; uses React from CDN)
const { useState, useEffect, useRef } = React;

const socket = io(); // from /socket.io/socket.io.js

function App() {
  const [me, setMe] = useState(null); // { userId, username, token }
  const [users, setUsers] = useState([]);
  const [online, setOnline] = useState(new Set());
  const [currentConv, setCurrentConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [convTitle, setConvTitle] = useState('');
  const msgRef = useRef();

  useEffect(() => {
    // socket events
    socket.on('auth_ok', (data) => {
      setMe(prev => ({ ...prev, userId: data.userId, username: data.username }));
      loadUsers();
    });
    socket.on('auth_error', () => alert('Socket authentication failed'));
    socket.on('user_online', ({ userId }) => setOnline(prev => { const s = new Set(prev); s.add(userId); return s; }));
    socket.on('user_offline', ({ userId }) => setOnline(prev => { const s = new Set(prev); s.delete(userId); return s; }));
    socket.on('conv_history', ({ convId, messages }) => {
      if (convId === currentConv) setMessages(messages || []);
    });
    socket.on('new_message', (m) => {
      if (m.convId === currentConv) setMessages(prev => [...prev, m]);
    });
    socket.on('message_read', ({ messageId, userId }) => {
      setMessages(prev => prev.map(m => (m._id === messageId ? { ...m, readBy: Array.from(new Set([...(m.readBy||[]), userId])) } : m)));
    });
    socket.on('conv_created', ({ convId, conv }) => {
      openConversation(convId);
    });
    return () => { socket.off(); };
  }, [currentConv]);

  async function api(path, data) {
    const res = await fetch(path, data ? { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) } : {});
    return res.json();
  }

  async function register(u, p) {
    const r = await api('/api/register', { username: u, password: p });
    alert(JSON.stringify(r));
  }
  async function login(u, p) {
    const r = await api('/api/login', { username: u, password: p });
    if (r && r.ok) {
      setMe({ token: r.token, userId: r.id, username: r.username });
      socket.emit('authenticate', { token: r.token });
    } else alert(JSON.stringify(r));
  }

  async function loadUsers() {
    try {
      const list = await api('/api/users');
      setUsers(list || []);
    } catch (e) {
      console.error(e);
      setUsers([]);
    }
  }

  function openConversation(convId) {
    setCurrentConv(convId);
    setMessages([]);
    setConvTitle('Conversation: ' + convId);
    socket.emit('join_conv', { convId });
  }

  function createConvWith(userIds) {
    const ids = Array.from(new Set([me.userId, ...userIds]));
    socket.emit('create_conv', { title: null, participantIds: ids });
  }

  function sendMessage() {
    const txt = msgRef.current.value.trim();
    if (!txt || !currentConv) return;
    socket.emit('send_message', { convId: currentConv, text: txt });
    msgRef.current.value = '';
  }

  function markRead(messageId) {
    socket.emit('mark_read', { convId: currentConv, messageId });
  }

  return React.createElement('div', { className: 'app' },
    React.createElement('div', { className: 'sidebar' },
      !me ? React.createElement(AuthForm, { onRegister: register, onLogin: login }) :
      React.createElement('div', null,
        React.createElement('div', { style: { marginBottom: 8 } }, React.createElement('strong', null, 'Logged in:'), ' ' + me.username),
        React.createElement('div', { style: { marginTop: 6, marginBottom: 6 } }, React.createElement('strong', null, 'Users')),
        users.map(u => React.createElement('div', {
          key: u._id,
          className: 'userItem',
          onDoubleClick: () => createConvWith([u._id])
        },
          React.createElement('span', { style: { marginRight: 8 } }, online.has(u._id) ? React.createElement('span', { className: 'onlineBadge' }) : null),
          u.username
        ))
      )
    ),
    React.createElement('div', { className: 'main' },
      React.createElement('div', { className: 'topbar' },
        React.createElement('strong', null, convTitle || 'No conversation')
      ),
      React.createElement('div', { className: 'chats' },
        messages.map(m => React.createElement('div', {
          key: m._id,
          className: 'message ' + (m.senderId === me?.userId ? 'me' : ''),
          onClick: () => markRead(m._id)
        },
          React.createElement('div', null, React.createElement('strong', null, m.senderId === me?.userId ? 'You' : m.senderId)),
          React.createElement('div', null, m.text),
          React.createElement('div', { className: 'meta' }, 'Sent: ' + new Date(m.createdAt).toLocaleString()),
          React.createElement('div', { className: 'small' }, 'Read by: ' + (m.readBy ? m.readBy.join(',') : 'None'))
        ))
      ),
      React.createElement('div', { className: 'composer' },
        React.createElement('input', { ref: msgRef, placeholder: 'Type a message' }),
        React.createElement('button', { onClick: sendMessage }, 'Send')
      )
    )
  );
}

function AuthForm({ onRegister, onLogin }) {
  const aRef = useRef();
  useEffect(()=>{},[]);
  const [u,setU] = useState('');
  const [p,setP] = useState('');
  return React.createElement('div', null,
    React.createElement('div', null, React.createElement('input', { placeholder:'username', value:u, onChange: e=>setU(e.target.value) })),
    React.createElement('div', { style: { marginTop:6 } }, React.createElement('input', { placeholder:'password', type:'password', value:p, onChange: e=>setP(e.target.value) })),
    React.createElement('div', { style:{ marginTop:8 } },
      React.createElement('button', { onClick: ()=>onRegister(u,p) }, 'Register'),
      React.createElement('button', { onClick: ()=>onLogin(u,p), style:{ marginLeft:8 } }, 'Login (or use seeded users)')
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
