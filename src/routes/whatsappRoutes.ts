import { Router } from 'express';
import { whatsappController } from '../controllers/whatsappController';

const router = Router();

// Endpoint para envío de mensajes
router.post('/send-whatsap', (req, res) => {
  whatsappController.sendWhatsApp(req, res);
});

// Endpoint para estado
router.get('/status', (req, res) => {
  whatsappController.getStatus(req, res);
});

// Endpoint para QR
router.get('/qr', (req, res) => {
  whatsappController.getQr(req, res);
});

// Endpoint para logout
router.post('/logout', (req, res) => {
  whatsappController.logout(req, res);
});

export default router;
