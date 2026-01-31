# WillayAPI - WhatsApp Business API

Sistema de gestión de instancias WhatsApp usando Baileys.

## 📋 Requisitos

- Node.js v18 o superior
- MySQL 5.7 o superior
- PM2 (para producción)
- 512 MB RAM mínimo (1 GB recomendado)

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/svargas201286/BaileysApiWhatsaap.git
cd BaileysApiWhatsaap
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar base de datos

**Crear la base de datos:**

```bash
mysql -u root -p
```

```sql
CREATE DATABASE willay_api CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit;
```

**Importar el esquema:**

```bash
mysql -u root -p willay_api < db_schema.sql
```

### 4. Configurar variables de entorno

**Copiar el archivo de ejemplo:**

```bash
cp .env.example .env
```

**Editar el archivo `.env`:**

```bash
nano .env
```

**Configurar los valores:**

```env
# Base de datos
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password_mysql
DB_NAME=willay_api

# Servidor
PORT=3009
NODE_ENV=production

# Seguridad (cambiar por un secreto único)
JWT_SECRET=genera_un_secreto_largo_y_seguro_aqui
```

### 5. Iniciar el servidor

**Desarrollo:**

```bash
npm run dev
```

**Producción (con PM2):**

```bash
pm2 start src/server.js --name baileys-api
pm2 save
pm2 startup
```

## 🌐 Acceso

- **Dashboard:** http://tu-servidor:3009
- **API:** http://tu-servidor:3009/api

## 📚 Uso

### Primer acceso

1. Abre el navegador en `http://tu-servidor:3009`
2. Haz clic en "Registrarse"
3. Crea tu cuenta
4. Inicia sesión
5. Ve a "Dispositivos" y crea una nueva instancia
6. Escanea el código QR con WhatsApp

### Endpoints principales

- `POST /api/auth/register` - Registrar usuario
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/instances` - Listar instancias
- `POST /api/instances` - Crear instancia
- `POST /api/send-whatsap` - Enviar mensaje
- `POST /api/send-receipt` - Enviar comprobante (PDF + XML)

## 🔧 Configuración de Nginx (Opcional)

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3009;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📝 Estructura de la Base de Datos

### Tabla `users`
- Usuarios del sistema
- Autenticación JWT
- Planes y licencias

### Tabla `instances`
- Instancias de WhatsApp
- Asociadas a usuarios
- Gestión de sesiones

## 🛡️ Seguridad

- Autenticación JWT
- Contraseñas hasheadas con bcrypt
- Validación de permisos por usuario
- Límite de intentos de QR (3 máximo)

## 🔄 Actualización

```bash
cd BaileysApiWhatsaap
git pull origin master
npm install
pm2 restart baileys-api
```

## 📞 Soporte

Para problemas o consultas, abre un issue en GitHub.

## 📄 Licencia

Privado - Todos los derechos reservados
