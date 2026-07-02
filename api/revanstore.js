export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const FIREBASE_URL = 'https://database-510f1-default-rtdb.firebaseio.com';
  const { path, method, data } = req.body;

  try {
    // LOGIN
    if (path === 'login') {
      const response = await fetch(FIREBASE_URL + '/users.json');
      const users = await response.json();
      for (const key in users) {
        if (users[key].username === data.username && users[key].password === data.password) {
          return res.status(200).json({
            success: true,
            data: {
              id: key,
              username: users[key].username,
              role: users[key].role || 'User',
              full_name: users[key].full_name || '',
              expiry_date: users[key].expiry_date || ''
            }
          });
        }
      }
      return res.status(200).json({ success: false, error: 'Login gagal' });
    }

    // GET USERS - tanpa password
    if (path === 'users' && (!method || method === 'GET')) {
      const response = await fetch(FIREBASE_URL + '/users.json');
      const users = await response.json();
      const filtered = {};
      for (const key in users) {
        filtered[key] = {
          username: users[key].username,
          role: users[key].role || 'User',
          full_name: users[key].full_name || '',
          expiry_date: users[key].expiry_date || ''
        };
      }
      return res.status(200).json(filtered);
    }

    // Path lainnya (GET, POST, PUT, PATCH, DELETE)
    let url = FIREBASE_URL + '/' + path + '.json';
    const options = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }
    if (method === 'DELETE') {
      options.method = 'DELETE';
    }

    const response = await fetch(url, options);
    const text = await response.text();
    if (!text || text === 'null') return res.status(200).json(null);
    return res.status(200).json(JSON.parse(text));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}