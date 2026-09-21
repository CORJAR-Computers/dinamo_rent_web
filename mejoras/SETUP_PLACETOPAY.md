# Guía Rápida: Credenciales y Parámetros Place to Pay (Evertec)

Este documento describe las variables de entorno necesarias para la pasarela de pagos de Dinamo Rent a Car.

## Variables de Entorno en Servidor (.env / Vercel Environment Variables)

```ini
# Ambiente: 'test' para pruebas, 'prod' para producción real
P2P_ENV="test"

# Identificador de comercio asignado por Evertec
P2P_LOGIN="dinamo_rent_sandbox"

# Clave secreta transaccional (TranKey) suministrada por Evertec
P2P_TRAN_KEY="tu_clave_secreta_evertec"

# URL a donde regresa el cliente tras pagar en el checkout de Evertec
P2P_RETURN_URL="https://dinamorentacar.com/pago/retorno"

# URL del webhook para notificaciones asíncronas (opcional / configurable)
P2P_NOTIFICATION_URL="https://dinamorentacar.com/api/webhooks/placetopay"
```

## Checklist para el Paso a Producción

- [ ] Recibir credenciales oficiales de producción de Evertec (`LOGIN` y `TRAN_KEY`).
- [ ] Configurar `P2P_ENV="prod"` en el panel de hosting (Vercel / VPS).
- [ ] Actualizar `P2P_LOGIN` con el código de comercio real.
- [ ] Actualizar `P2P_TRAN_KEY` con la llave segura de producción.
- [ ] Comprobar que `P2P_RETURN_URL` apunte al dominio oficial con protocolo HTTPS (`https://dinamorentacar.com/pago/retorno`).
- [ ] Realizar una transacción de prueba de bajo valor con una tarjeta real para validar el ciclo completo de aprobación y retorno.
- [ ] Solicitar la aprobación final de paso a producción al ejecutivo de cuenta de Evertec.
