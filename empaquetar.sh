#!/bin/bash
# Genera vuelta-al-mundo-herramientas.zip listo para subir al hPanel de Hostinger
cd "$(dirname "$0")"
rm -f ../vuelta-al-mundo-herramientas.zip
zip -rq ../vuelta-al-mundo-herramientas.zip . \
  -x ".git/*" ".gitignore" "empaquetar.sh" "*.DS_Store" "api/config.php" "_login_tmp.html"
echo "Listo: $(cd .. && pwd)/vuelta-al-mundo-herramientas.zip ($(du -h ../vuelta-al-mundo-herramientas.zip | cut -f1))"
