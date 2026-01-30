import fs from 'fs';
import path from 'path';

const usersPath = path.join(process.cwd(), 'src', 'config', 'users.json');

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No se proporcionó token de acceso' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const userData = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    const user = userData.users.find(u => u.token === token);

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
