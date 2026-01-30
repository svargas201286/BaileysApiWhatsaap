import { Router } from 'express';
import { whatsappController } from '../controllers/whatsappController.js';
import { authMiddleware } from '../middleware/auth.js';
const router = Router();

// Todas las rutas siguientes requieren el token único
router.use(authMiddleware);

// Endpoint para envío de mensajes
router.post('/send-whatsap', (req, res) => {
    whatsappController.sendWhatsApp(req, res);
});

// Endpoint para estado
router.get('/status', (req, res) => {
    whatsappController.getStatus(req, res);
});

// Endpoint para listar instancias
router.get('/instances', (req, res) => {
    whatsappController.getInstances(req, res);
});

// Endpoint para crear instancia
router.post('/instances', (req, res) => {
    whatsappController.createInstance(req, res);
});

// Endpoint para logout
router.post('/logout', (req, res) => {
    whatsappController.logout(req, res);
});

// Endpoint para eliminar instancia permanentemente
router.post('/delete-instance', (req, res) => {
    whatsappController.deleteInstance(req, res);
});

export default router;
