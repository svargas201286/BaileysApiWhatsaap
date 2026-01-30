import pool from '../config/db.js';

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No se proporcionó token de acceso' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE token = ?', [token]);
    const user = users[0];

    if (!user) {
      return res.status(403).json({ success: false, message: 'Token de acceso inválido' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Error en authMiddleware:', error);
    return res.status(500).json({ success: false, message: 'Error interno de autenticación' });
  }
};
