import type { Request, Response } from 'express';
import { whatsappService } from '../services/whatsappService';

export class WhatsappController {

  public async sendWhatsApp(req: Request, res: Response): Promise<void> {
    try {
      const { number, type, message, media, filename, caption } = req.body;

      if (!number) {
        res.status(400).json({ success: false, message: 'Falta el número de destino' });
        return;
      }

      let result;

      if (type === 'text') {
        if (!message) {
          res.status(400).json({ success: false, message: 'Falta el mensaje de texto' });
          return;
        }
        result = await whatsappService.sendMessage(number, message);

      } else if (type === 'media') {
        if (!media) {
          res.status(400).json({ success: false, message: 'Falta el contenido media (base64)' });
          return;
        }
        // Determinar si es video o imagen por el filename o una propiedad extra, 
        // simplificaremos asumiendo imagen si no se especifica
        const mediaType = filename?.endsWith('.mp4') ? 'video' : 'image';
        result = await whatsappService.sendMedia(number, media, mediaType, caption || '');

      } else {
        // Default to document (or explicit 'document' type)
        if (!media || !filename) {
          res.status(400).json({ success: false, message: 'Faltan datos para documento (media, filename)' });
          return;
        }
        result = await whatsappService.sendDocument(number, media, filename, caption || '');
      }

      console.log('Mensaje enviado con éxito:', result?.key?.id);
      res.json({ success: true, message: 'Enviado correctamente', id: result?.key?.id });

    } catch (error: any) {
      console.error('Error enviando mensaje:', error);
      res.status(500).json({ success: false, message: error.message || 'Error interno del servidor' });
    }
  }

  public getStatus(req: Request, res: Response): void {
    res.json({
      status: whatsappService.connectionState,
      message: 'Estado obtenido correctamente'
    });
  }

  public getQr(req: Request, res: Response): void {
    if (whatsappService.qrCode) {
      res.json({
        success: true,
        qr: whatsappService.qrCode
      });
    } else {
      res.json({
        success: false,
        message: 'QR no disponible (¿Ya estás conectado o no se ha generado aún?)'
      });
    }
  }

  public async logout(req: Request, res: Response): Promise<void> {
    try {
      const result = await whatsappService.logout();
      if (result) {
        res.json({ success: true, message: 'Sesión cerrada correctamente' });
      } else {
        res.status(500).json({ success: false, message: 'Error cerrando sesión' });
      }
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error cerrando sesión' });
    }
  }
}

export const whatsappController = new WhatsappController();
