"""Servidor para probar la app en esta computadora, en http://localhost:8080

    python herramientas/servidor-local.py [puerto]

Es el mismo servidor sencillo de Python, pero mandando «no guardes nada en cache»: asi, al
recargar, el navegador siempre trae la ultima version de los archivos que acabas de cambiar.
Sin esto, el navegador se queda con el JavaScript viejo y parece que los cambios no funcionan.

(Ojo: el service worker SI guarda copias para que la app sirva sin internet. Si al recargar
sigues viendo lo de antes, abre las herramientas del navegador → Application → Service Workers
→ Unregister, o marca «Update on reload».)
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class SinCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, formato, *args):   # menos ruido en la consola
        if not self.path.startswith(('/js/', '/css/', '/icons/')):
            super().log_message(formato, *args)


if __name__ == '__main__':
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = partial(SinCache, directory='.')
    print('Mi Agenda en http://localhost:%d  (Ctrl+C para parar)' % puerto)
    ThreadingHTTPServer(('127.0.0.1', puerto), handler).serve_forever()
