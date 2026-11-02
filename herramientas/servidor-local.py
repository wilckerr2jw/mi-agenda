"""Servidor para probar la app en esta computadora, en http://localhost:8080

    python herramientas/servidor-local.py [puerto] [--wifi]

De fabrica solo atiende a esta computadora. Con --wifi tambien atiende al telefono
que este en la misma red, en la direccion que se imprime al arrancar; mientras tanto
cualquiera en esa red puede abrir la app, asi que conviene pararlo al terminar.
Ojo: por http simple el navegador NO registra el service worker, asi que desde el
telefono se prueba la pantalla y no el modo sin conexion ni la instalacion.

Es el mismo servidor sencillo de Python, pero mandando «no guardes nada en cache»: asi, al
recargar, el navegador siempre trae la ultima version de los archivos que acabas de cambiar.
Sin esto, el navegador se queda con el JavaScript viejo y parece que los cambios no funcionan.

(Ojo: el service worker SI guarda copias para que la app sirva sin internet. Si al recargar
sigues viendo lo de antes, abre las herramientas del navegador → Application → Service Workers
→ Unregister, o marca «Update on reload».)
"""
import socket
import sys
import threading
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


class ServidorIPv6(ThreadingHTTPServer):
    address_family = socket.AF_INET6


def ips_de_esta_pc():
    """Las direcciones de esta computadora, la del wifi primero.

    No sirve preguntar «por donde saldria a internet»: con una VPN encendida eso
    devuelve la direccion de la VPN, que el telefono no alcanza. Asi que se listan
    todas y se ponen adelante las del wifi o el cable de casa (192.168.x y 172.16-31.x).
    """
    try:
        todas = sorted({i[4][0] for i in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)})
    except OSError:
        return ['localhost']
    casa = [x for x in todas if x.startswith('192.168.') or x.startswith('172.')]
    return (casa + [x for x in todas if x not in casa]) or ['localhost']


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--wifi']
    wifi = '--wifi' in sys.argv
    puerto = int(args[0]) if args else 8080
    handler = partial(SinCache, directory='.')
    print('Mi Agenda en http://localhost:%d  (Ctrl+C para parar)' % puerto)
    if wifi:
        for i, ip in enumerate(ips_de_esta_pc()):
            etiqueta = 'Desde el telefono (misma red):' if i == 0 else '  o si no, prueba con:        '
            print('%s http://%s:%d' % (etiqueta, ip, puerto))
    else:
        # En Windows «localhost» se resuelve primero como ::1 (IPv6). Si solo atendieramos
        # en 127.0.0.1, el reenvio de puertos de chrome://inspect daria «conexion rechazada».
        try:
            ipv6 = ServidorIPv6(('::1', puerto), handler)
        except OSError:
            pass   # sin IPv6 en esta maquina: con 127.0.0.1 alcanza
        else:
            threading.Thread(target=ipv6.serve_forever, daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0' if wifi else '127.0.0.1', puerto), handler).serve_forever()
