import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/register', (req, res) => authController.register(req, res));
router.post('/login', (req, res) => authController.login(req, res));

// Todas las rutas siguientes requieren el token único (como profile)
router.use(authMiddleware);

router.get('/profile', (req, res) => authController.getProfile(req, res));

export default router;
