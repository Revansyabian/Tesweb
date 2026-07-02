export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { path, data } = req.body;
  
  try {
    if (path === 'login') {
      const response = await fetch('https://database-510f1-default-rtdb.firebaseio.com/users.json');
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
    
    if (path === 'users') {
      const response = await fetch('https://database-510f1-default-rtdb.firebaseio.com/users.json');
      const users = await response.json();
      const filtered = {};
      for (const key in users) {
        filtered[key] = {
          username: users[key].username,
          role: users[key].role || 'User',
          expiry_date: users[key].expiry_date || ''
        };
      }
      return res.status(200).json(filtered);
    }
    
    const url = `https://database-510f1-default-rtdb.firebaseio.com/${path}.json`;
    const options = { method: data ? 'PUT' : 'GET', headers: { 'Content-Type': 'application/json' } };
    if (data) options.body = JSON.stringify(data);
    const response = await fetch(url, options);
    const result = await response.json();
    return res.status(200).json(result);
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}