import pool from '../config/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

class AuthController {
  /**
   * Registrar un nuevo usuario
   */
  async register(req, res) {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios' });
    }

    try {
      // Verificar si el usuario ya existe
      const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: 'El correo ya está registrado' });
      }

      // Hashear la contraseña
      const hashedPassword = await bcrypt.hash(password, 10);

      // Generar token único inicial (JWT-like random string for profile display)
      const uniqueToken = jwt.sign({ email }, process.env.JWT_SECRET || 'willay_secret_key');

      // Insertar usuario
      const [result] = await pool.query(
        'INSERT INTO users (name, email, password, token, expireAt) VALUES (?, ?, ?, ?, ?)',
        [name, email, hashedPassword, uniqueToken, new Date(new Date().setFullYear(new Date().getFullYear() + 1))] // 1 año de licencia por defecto
      );

      res.json({
        success: true,
        message: 'Usuario registrado correctamente',
        userId: result.insertId
      });
    } catch (error) {
      console.error('Error en register:', error);
      res.status(500).json({ success: false, message: 'Error interno al registrar usuario' });
    }
  }

  /**
   * Iniciar sesión
   */
  async login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Correo y contraseña requeridos' });
    }

    try {
      const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      const user = users[0];

      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
      }

      // El token ya existe en la DB (el único token del usuario)
      res.json({
        success: true,
        message: 'Inicio de sesión exitoso',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          token: user.token,
          plan: user.plan,
          license: user.license,
          expireAt: user.expireAt
        }
      });
    } catch (error) {
      console.error('Error en login:', error);
      res.status(500).json({ success: false, message: 'Error interno al iniciar sesión' });
    }
  }

  /**
   * Obtener perfil del usuario autenticado
   */
  async getProfile(req, res) {
    // El usuario viene del authMiddleware (lo implementaremos después vinculando a DB)
    res.json({ success: true, user: req.user });
  }
}

export const authController = new AuthController();
