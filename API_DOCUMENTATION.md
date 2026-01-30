# Documentación Técnica: API WhatsApp (willayAPI)

Esta API permite la integración de envíos de WhatsApp y gestión de dispositivos en sistemas externos como facturadores o CRMs.

## 1. Autenticación

Todas las peticiones deben incluir el header `Authorization` con un **Bearer Token** obtenido desde tu panel de usuario.

```http
Authorization: Bearer TU_TOKEN_AQUÍ
Content-Type: application/json
```

---

## 2. Envío de Comprobantes (Especializado)

Endpoint diseñado para enviar múltiples documentos (PDF + XML) en una sola petición.

**URL:** `POST /api/send-receipt`

### Cuerpo de la Petición (JSON):
| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `instanceId` | String | El ID único de tu dispositivo conectado. |
| `number` | String | Número del cliente (ej: 519XXXXXXXX). |
| `files` | Array | Lista de objetos con los documentos a enviar. |

### Ejemplo de Objeto en `files`:
```json
{
  "type": "url", 
  "media": "https://tusistema.com/comprobantes/PDF-123.pdf",
  "filename": "Factura-F001-123.pdf",
  "caption": "Aquí tiene su PDF"
}
```
*Nota: `type` puede ser "url" o "base64".*

### Ejemplo Postman (Cuerpo Completo):
```json
{
  "instanceId": "Ventas-01",
  "number": "51948907640",
  "files": [
    {
      "type": "url",
      "media": "http://ejemplo.com/api/wspdf/20601234567-01-F001-123.pdf",
      "filename": "Factura-F001-123.pdf",
      "caption": "📕 *SE ADJUNTA SU COMPROBANTE EN FORMATO PDF*"
    },
    {
      "type": "url",
      "media": "http://ejemplo.com/api/xml/20601234567-01-F001-123.XML",
      "filename": "Factura-F001-123.xml",
      "caption": "📑 *SE ADJUNTA SU COMPROBANTE EN FORMATO XML*"
    }
  ]
}
```

---

## 3. Envío de Mensajes Simples

**URL:** `POST /api/send-whatsap`

### Envío de Texto:
```json
{
  "instanceId": "Ventas-01",
  "number": "51948907640",
  "type": "text",
  "message": "Hola, este es un mensaje de prueba."
}
```

---

## 4. Guía de Uso en Postman

1. **Método**: Selecciona `POST`.
2. **URL**: Ingresa `http://tuservidor:3009/api/send-receipt`.
3. **Auth**: Ve a la pestaña **Auth**, elige **Bearer Token** y pega tu token.
4. **Body**: Elige **raw** y formato **JSON**. Pega el ejemplo del punto 2.
5. **Send**: Haz clic en enviar y verifica la respuesta.

> [!TIP]
> La API maneja automáticamente un retraso de 1.5 segundos entre el envío del PDF y el XML para evitar bloqueos por parte de WhatsApp y asegurar que lleguen en el orden correcto.
