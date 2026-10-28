<?xml version="1.0" encoding="UTF-8"?>
<!-- Hoja de estilo del feed RSS de FP al día: quien abre feed.xml en el navegador ve una página legible en vez del XML.
     Los lectores de RSS la ignoran. Se publica en fpaldia.es/fp-al-dia/feed.xsl (Iván, 28/10/2026). -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/rss/channel">
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>RSS · FP al día</title>
<style>
:root{--atl:#0057B8;--sol:#FFC400;--picon:#0E1621;--gris:#55606E;--linea:#E3E8EF}
*{box-sizing:border-box}
body{margin:0;background:#F5F7FA;color:var(--picon);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:720px;margin:0 auto;padding:24px 16px 48px}
.head{background:var(--atl);color:#fff;border-radius:16px;padding:22px 20px}
.head h1{margin:0 0 6px;font-size:22px}
.head p{margin:0;opacity:.92}
.box{background:#fff;border:1px solid var(--linea);border-radius:14px;padding:18px 20px;margin:16px 0}
.box h2{margin:0 0 8px;font-size:17px}
.btn{display:block;text-align:center;padding:12px;border-radius:12px;font-weight:800;text-decoration:none;margin:8px 0}
.li{background:#0A66C2;color:#fff}
.mail{background:#fff;color:var(--atl);border:2px solid var(--atl)}
code{display:block;background:#F0F3F7;border-radius:8px;padding:10px;word-break:break-all;font-size:14px}
.small{color:var(--gris);font-size:14px}
.item{background:#fff;border:1px solid var(--linea);border-radius:12px;padding:14px 16px;margin:10px 0}
.item a{color:var(--picon);font-weight:700;text-decoration:none}
.item a:hover{color:var(--atl)}
.item p{margin:6px 0 0;color:var(--gris);font-size:14px}
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>Esto es el feed RSS de FP al día</h1>
    <p>Las noticias de FP de Canarias y España, martes y viernes.</p>
  </div>
  <div class="box">
    <h2>¿Cómo lo sigo?</h2>
    <a class="btn li" href="https://www.linkedin.com/build-relation/newsletter-follow?entityUrn=7520414000409395201">Suscríbete en LinkedIn</a>
    <a class="btn mail" href="https://blogtrottr.com/?subscribe=https://fpaldia.es/fp-al-dia/feed.xml">Recíbelo por email</a>
    <p class="small">Si usas un lector de RSS (Feedly, Inoreader, NetNewsWire…), copia esta dirección:</p>
    <code><xsl:value-of select="atom:link/@href" xmlns:atom="http://www.w3.org/2005/Atom"/></code>
    <p class="small"><a href="https://fpaldia.es/fp-al-dia/">Ir a la última edición</a> · <a href="https://fpaldia.es/radar/">FP Radar</a></p>
  </div>
  <h2>Últimas noticias</h2>
  <xsl:for-each select="item">
    <div class="item">
      <a href="{link}" target="_blank" rel="noopener"><xsl:value-of select="title"/></a>
      <p><xsl:value-of select="description"/></p>
    </div>
  </xsl:for-each>
</div>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
