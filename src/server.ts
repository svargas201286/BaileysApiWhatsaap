import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import whatsappRoutes from './routes/whatsappRoutes';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3009;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(process.cwd(), 'public')));

// Rutas API
app.use('/api', whatsappRoutes);

// Ruta de salud básica
app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`Servidor API WhatsApp escuchando en puerto ${PORT}`);
});
