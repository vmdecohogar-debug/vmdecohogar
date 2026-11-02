// Páginas informativas de la tienda: preguntas frecuentes, tiempos de respuesta y política de privacidad.
// Los textos viven acá (y no en el navegador) para que el servidor también los use en el SEO:
// la descripción de cada página y los datos de preguntas frecuentes para Google (FAQPage).
// Se completan con los datos que nadia carga en el panel (nombre, WhatsApp, mail, horario, despacho).

const pesos = (cents) => `$${Math.round(cents / 100).toLocaleString('es-AR')}`;

// Cómo contactarse, con lo que haya cargado en el panel.
function channels(store) {
  const c = store.contact ?? {};
  const list = [];
  if (store.whatsapp) list.push('WhatsApp (el botón verde de la página)');
  if (c.email) list.push(`mail a ${c.email}`);
  if (c.phone) list.push(`teléfono ${c.phone}`);
  return list.length ? list.join(', ') : 'WhatsApp, desde el botón verde de la página';
}

// Confirmados por nadia (2026-11-02): consultas en 12 h, horario lunes a sábado 9 a 18, pedidos confirmados en horario de atención.
// El resto de los plazos es la propuesta inicial.
export const RESPONSE_TIMES = [
  { key: 'consultas', label: 'Consultas por WhatsApp', time: 'Dentro de las 12 horas', detail: 'Contadas dentro de nuestro horario de atención. Muchas veces respondemos mucho antes.' },
  { key: 'mail', label: 'Consultas por mail o formulario', time: 'Dentro de las 12 horas', detail: 'Contadas dentro del horario de atención. Si la consulta es urgente, preferí WhatsApp.' },
  { key: 'pedido', label: 'Confirmación de tu pedido', time: 'En el momento', detail: 'Si lo hacés dentro de nuestro horario de atención. Los pedidos que llegan fuera de horario se confirman apenas abrimos, el siguiente día hábil.' },
  { key: 'transferencia', label: 'Verificación de transferencias', time: 'Hasta 24 horas hábiles', detail: 'Desde que nos mandás el comprobante. Con Mercado Pago la acreditación es automática.' },
  { key: 'despacho', label: 'Preparación y despacho', time: 'De 1 a 3 días hábiles', detail: 'Desde que el pago está acreditado. Te avisamos por WhatsApp cuando sale tu pedido.' },
  { key: 'mayoristas', label: 'Alta de cuentas mayoristas', time: 'Hasta 48 horas hábiles', detail: 'Revisamos cada solicitud y te avisamos por WhatsApp cuando tu cuenta está habilitada.' },
  { key: 'reclamos', label: 'Cambios, devoluciones y reclamos', time: 'Respuesta en 48 horas hábiles', detail: 'Y una solución en un plazo máximo de 10 días hábiles.' },
];

export function infoPages(store = {}, { wholesaleMin = 0 } = {}) {
  const name = store.name || 'VM Bazar y Deco';
  const c = store.contact ?? {};
  const hours = c.hours || 'de lunes a sábado de 9 a 18 h'; // horario confirmado por nadia; si lo carga en el panel, se usa ese
  const dispatch = store.dispatchNote || 'Los pedidos se despachan de 1 a 3 días hábiles.';
  const contacto = channels(store);
  const where = c.city || c.address ? ` (${[c.address, c.city].filter(Boolean).join(', ')})` : '';

  const faq = {
    path: '/preguntas-frecuentes',
    title: 'Preguntas frecuentes',
    description: `Cómo comprar en ${name}: medios de pago, envíos, tiempos de despacho, cambios, devoluciones y compras mayoristas.`,
    intro: '¿Tenés una duda? Acá están las respuestas a lo que más nos consultan. Si no encontrás lo que buscás, escribinos.',
    groups: [
      {
        title: 'Compras',
        items: [
          { q: '¿Cómo compro?', a: 'Elegí los productos, sumalos al carrito y tocá "Finalizar compra". Completá tus datos, tu código postal y la dirección de entrega (ahí calculamos el envío) y elegí el medio de pago. Al terminar te mostramos el resumen de tu pedido y te contactamos por WhatsApp para confirmarlo.' },
          { q: '¿Necesito crear una cuenta para comprar?', a: 'No. Podés comprar como invitado con tu nombre, teléfono y dirección. Solo los clientes mayoristas tienen cuenta, para ver sus precios.' },
          { q: '¿Los precios son finales?', a: 'Sí, los precios publicados son precios finales en pesos argentinos. El envío se suma aparte según la distancia hasta tu domicilio y lo ves antes de pagar.' },
          { q: '¿Cómo sé si hay stock?', a: 'Los productos publicados están disponibles. Si al preparar tu pedido falta algo, te avisamos por WhatsApp antes de despachar y te ofrecemos cambiarlo por otro o devolverte ese importe.' },
        ],
      },
      {
        title: 'Pagos',
        items: [
          { q: '¿Qué medios de pago aceptan?', a: 'Mercado Pago (tarjetas de crédito, débito y dinero en cuenta) y transferencia bancaria. Si preferís pagar en efectivo, escribinos por WhatsApp y lo coordinamos.' },
          { q: 'Pagué por transferencia, ¿qué hago?', a: 'Al finalizar la compra te mostramos los datos de la cuenta. Mandanos el comprobante por WhatsApp desde la página de tu pedido y lo verificamos dentro de las 24 horas hábiles.' },
          { q: '¿Es seguro pagar con tarjeta?', a: 'Sí. Los pagos con tarjeta se hacen dentro de Mercado Pago: nosotros nunca vemos ni guardamos los datos de tu tarjeta.' },
        ],
      },
      {
        title: 'Envíos',
        items: [
          { q: '¿Hacen envíos? ¿Cuánto cuestan?', a: 'Sí, enviamos en moto. En "Finalizar compra" escribís tu código postal y te mostramos el costo al instante, antes de pagar. El precio depende de la distancia desde nuestro local hasta tu domicilio.' },
          { q: '¿Cómo se calcula el costo del envío?', a: 'Con tu código postal ubicamos tu localidad y calculamos la distancia. Cuando completás la calle y el número, lo ajustamos a tu dirección exacta. El costo es una tarifa fija más un monto por kilómetro, como un viaje en moto de aplicación, y siempre lo ves antes de confirmar el pedido. El que figura en tu pedido es el que pagás.' },
          { q: '¿Hasta dónde llegan?', a: 'Si tu domicilio queda más lejos de lo que cubrimos en moto, la página te avisa al poner tu código postal. En ese caso escribinos por WhatsApp y buscamos otra forma de hacértelo llegar.' },
          { q: '¿Cuánto tarda en llegar mi pedido?', a: `${dispatch} El plazo empieza a contar cuando el pago está acreditado. Te avisamos por WhatsApp cuando sale.` },
          { q: '¿Puedo retirar mi pedido?', a: `Consultanos por WhatsApp y coordinamos el retiro${where}.` },
        ],
      },
      {
        title: 'Cambios y devoluciones',
        items: [
          { q: '¿Puedo arrepentirme de la compra?', a: 'Sí. Por ser una compra a distancia, tenés 10 días corridos desde que recibís el producto para arrepentirte, sin dar explicaciones (Ley 24.240 de Defensa del Consumidor). El producto tiene que estar sin uso y con su empaque. Escribinos y te indicamos cómo devolverlo; te reintegramos lo que pagaste.' },
          { q: '¿Y si un producto llega roto o con fallas?', a: 'Avisanos dentro de las 48 horas de recibirlo, con una foto del producto y del paquete. Te lo cambiamos o te devolvemos el dinero, y el envío corre por nuestra cuenta.' },
          { q: '¿Puedo cambiar un producto por otro?', a: 'Sí, dentro de los 30 días, si está sin uso y con su empaque original. El envío del cambio lo paga quien compra, salvo que el producto tenga una falla.' },
        ],
      },
      {
        title: 'Compras mayoristas',
        items: [
          { q: '¿Venden por mayor?', a: `Sí. Registrate en la sección "Compras mayoristas" y, cuando habilitamos tu cuenta, ves los precios mayoristas en toda la tienda.${wholesaleMin > 0 ? ` La compra mínima mayorista es de ${pesos(wholesaleMin)}, sin contar el envío.` : ''}` },
          { q: '¿Cuánto tarda en habilitarse mi cuenta mayorista?', a: 'Revisamos cada solicitud y te avisamos por WhatsApp dentro de las 48 horas hábiles.' },
        ],
      },
      {
        title: 'Atención',
        items: [
          { q: '¿Cómo me comunico con ustedes?', a: `Por ${contacto}. Atendemos ${hours}.` },
          { q: '¿Cuánto tardan en responder?', a: 'Respondemos todas las consultas dentro de las 12 horas, contadas en nuestro horario de atención. En la página "Tiempos de respuesta" están todos nuestros plazos.' },
        ],
      },
    ],
  };

  const compromiso = {
    path: '/tiempos-de-respuesta',
    title: 'Nuestro compromiso de tiempos de respuesta',
    description: `Cuánto tardamos en ${name} en responder consultas, confirmar pedidos, verificar pagos, despachar y resolver cambios o reclamos.`,
    intro: `Queremos que sepas siempre qué esperar. Estos son los plazos con los que nos comprometemos. Atendemos ${hours}; los días hábiles son de lunes a sábado, sin contar feriados.`,
    items: RESPONSE_TIMES,
    closing: `Si en algún caso no cumplimos estos plazos, escribinos por ${contacto} y lo priorizamos.`,
  };

  const privacidad = {
    path: '/privacidad',
    title: 'Política de privacidad',
    description: `Cómo ${name} recolecta, usa y protege tus datos personales, y cómo ejercer tus derechos según la Ley 25.326 de Protección de Datos Personales.`,
    updated: '2 de noviembre de 2026',
    sections: [
      {
        h: '1. Quién es responsable de tus datos',
        p: [
          `El responsable de la base de datos es Nadia Florencia Morellini, CUIT 27-36552682-1, titular de ${name}${where}. Para cualquier consulta sobre tus datos podés escribirnos por ${contacto}.`,
        ],
      },
      {
        h: '2. Qué datos recolectamos',
        p: [
          'Cuando hacés un pedido: tu nombre, teléfono, dirección, código postal y localidad de entrega, la distancia calculada para el envío y, si las dejás, notas para la entrega. También guardamos el detalle del pedido (productos, importes, medio de pago y estado).',
          'Si te registrás como cliente mayorista: tu nombre, teléfono, contraseña (guardada cifrada, nadie puede leerla) y, si los cargás, tu mail, dirección, localidad y el nombre de tu negocio.',
          'No recolectamos datos sensibles ni los datos de tu tarjeta: los pagos con tarjeta se procesan dentro de Mercado Pago, con su propia política de privacidad.',
        ],
      },
      {
        h: '3. Para qué los usamos',
        p: [
          'Usamos tus datos solo para preparar, cobrar y entregar tus pedidos, comunicarnos con vos sobre ellos (por WhatsApp, teléfono o mail), gestionar tu cuenta mayorista, atender cambios y reclamos, y cumplir obligaciones legales e impositivas.',
          'No vendemos ni alquilamos tus datos, y no te mandamos publicidad sin tu consentimiento.',
        ],
      },
      {
        h: '4. Con quién los compartimos',
        p: [
          'Solo con quienes necesitamos para darte el servicio: el transporte o mensajería que entrega tu pedido (nombre, teléfono y dirección), el servicio público de normalización de direcciones del Estado argentino (Georef), al que le consultamos tu dirección y código postal (sin tu nombre ni teléfono) para calcular la distancia del envío, Mercado Pago cuando elegís pagar por ese medio, y los proveedores que alojan la página y la base de datos. Los servidores de esos proveedores pueden estar fuera de Argentina; trabajamos con empresas que aplican medidas de seguridad adecuadas.',
          'También podemos informar datos a autoridades cuando una ley o una orden judicial lo exija.',
        ],
      },
      {
        h: '5. Datos guardados en tu navegador',
        p: [
          'La página guarda en tu propio navegador tu carrito, tus datos de entrega para la próxima compra, si preferís el modo oscuro y, si sos mayorista, tu sesión iniciada. Esa información queda en tu dispositivo y podés borrarla en cualquier momento desde la configuración del navegador. No usamos cookies de publicidad ni de seguimiento de terceros.',
        ],
      },
      {
        h: '6. Cuánto tiempo los guardamos',
        p: [
          'Conservamos los datos de los pedidos mientras sean necesarios para las finalidades de arriba y durante los plazos que exigen las normas comerciales e impositivas. Los datos de una cuenta mayorista se guardan mientras la cuenta esté activa o hasta que pidas darla de baja.',
        ],
      },
      {
        h: '7. Cómo los protegemos',
        p: [
          'La página funciona con conexión segura (https), las contraseñas se guardan cifradas y solo la administración de la tienda puede ver los pedidos. Aplicamos medidas técnicas y organizativas razonables para evitar accesos no autorizados, pérdidas o alteraciones.',
        ],
      },
      {
        h: '8. Tus derechos',
        p: [
          'Podés pedirnos en cualquier momento acceder a tus datos, corregirlos, actualizarlos o eliminarlos, y retirar tu consentimiento. Escribinos por los canales de contacto indicados arriba y te respondemos en los plazos de la ley: 10 días corridos para el acceso y 5 días hábiles para la rectificación, actualización o supresión.',
          'El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326.',
          'La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.',
        ],
      },
      {
        h: '9. Menores de edad',
        p: ['Las compras en la tienda están pensadas para personas mayores de 18 años. Si sos menor, pedile a una persona adulta que haga la compra por vos.'],
      },
      {
        h: '10. Cambios en esta política',
        p: ['Si cambiamos esta política, publicamos la nueva versión en esta página con su fecha de actualización.'],
      },
    ],
  };

  return { faq, compromiso, privacidad };
}

// Para Google: las preguntas frecuentes como datos estructurados (FAQPage).
export function faqJsonLd(faq) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.groups.flatMap((g) => g.items).map((i) => ({
      '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  };
}
