# BD-Proyecto3
Emily A. Gongora Giron 
#24308

**Como levantar el proyecto**
1. Tener Docker instalado y corriendo
2. Clona el repo:

- git clone https://github.com/EmilyGG24308/BD-Proyecto2.git
- cd BD-Proyecto2
- git checkout proyecto-3

4. Copia el .env
- cp .env.example .env
6. Levanta todo
- docker compose up --build
8. Abre: http://localhost:8080

### Acceder al sistema

Una vez que los contenedores estén ejecutándose:

* Frontend: http://localhost:8080
* API: http://localhost:3000

### Credenciales de prueba (contraseña: secret)

| Usuario        | Rol       | Acceso                                  |
| -------------- | --------- | --------------------------------------- |
| admin_user     | admin     | Todo                                    |
| gerente_user   | gerente   | Leer todo + editar productos/categorías |
| vendedor_user  | vendedor  | Ver productos/clientes + crear ventas   |
| cajero_user    | cajero    | Ver ventas + gestionar clientes         |
| bodeguero_user | bodeguero | Solo stock de productos                 |

### Roles en el DBMS

| Rol           | Tablas (SELECT)      | Permisos extra                   |
| ------------- | -------------------- | -------------------------------- |
| rol_admin     | Todas                | ALL PRIVILEGES                   |
| rol_gerente   | Todas                | INSERT/UPDATE producto/categoria |
| rol_vendedor  | producto, cliente... | INSERT en venta/detalle_venta    |
| rol_cajero    | venta, cliente...    | INSERT/UPDATE en cliente         |
| rol_bodeguero | producto             | UPDATE en producto               |

