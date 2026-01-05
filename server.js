// Agrega esta línea HASTA ARRIBA, antes de const express...
require('dotenv').config(); 

// ... el resto de tus imports ...

// server.js - Versión Multi-Producto (Carrito)
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path'); 

const app = express();

/** SEGURIDAD Y SESIONES */
app.use(session({
    secret: process.env.SESSION_SECRET, 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000*60*60 } 
}));

// Middleware de protección
function protegerRuta(req, res, next) {
    if (req.session && req.session.usuario) {
        return next();
    } else {
        res.redirect('/index.html');
    }
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

/** CONEXIÓN MONGODB */
const uri = process.env.MONGODB_URI;
mongoose.connect(uri)
    .then(() => console.log("✅ Conectado a la Nube"))
    .catch(e => console.error("❌ Error:", e));


// ==========================================
//              ZONA DE USUARIOS
// ==========================================
const usuarioSchema = new mongoose.Schema({ usuario: String, clave: String });
const Usuario = mongoose.model('Usuario', usuarioSchema);

async function crearAdmin() {
    if (await Usuario.countDocuments() === 0) {
        await Usuario.create({ usuario: "admin", clave: "1234" });
        console.log("👤 Usuario admin creado.");
    }
}
crearAdmin();

app.post('/login', async (req, res) => {
    const { usuario, password } = req.body;
    const encontrado = await Usuario.findOne({ usuario: usuario, clave: password });
    if (encontrado) {
        req.session.usuario = usuario; 
        res.json({ exito: true });
    } else {
        res.json({ exito: false });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/index.html'); 
    });
});


// ==========================================
//              ZONA DE PRODUCTOS
// ==========================================
const productoSchema = new mongoose.Schema({ nombre: String, precio: Number });
const Producto = mongoose.model('Producto', productoSchema);

async function inicializarProductos() {
    const cantidad = await Producto.countDocuments();
    if (cantidad === 0) {
        console.log("📦 Base de productos vacía. Inicializando...");
        await Producto.insertMany([
            { nombre: "Persiana Sheer Elegance", precio: 1200 },
            { nombre: "Persiana Blackout Premium", precio: 850 },
            { nombre: "Cortina Enrollable Solar", precio: 950 },
            { nombre: "Motorización Básica", precio: 2500 }
        ]);
    }
}
inicializarProductos();

app.get('/productos', async (req, res) => {
    try {
        const listaProductos = await Producto.find();
        res.json(listaProductos);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener productos" });
    }
});
// ==========================================
//              ZONA DE CLIENTES (NUEVA)
// ==========================================
const clienteSchema = new mongoose.Schema({
    nombre: String,
    razonSocial: String,
    email: String,
    telefono: String,
    tipo: String, // Cliente o Prospecto
    canal: String, // Origen (WhatsApp, Facebook, etc)
    
    // Dirección
    calle: String,
    colonia: String,
    localidad: String,
    cp: String,
    estado: String,
    pais: String,
    referencia: String,

    fechaRegistro: { type: Date, default: Date.now }
});

const Cliente = mongoose.model('Cliente', clienteSchema);

// ==========================================
// 🚀 ZONA DE MIGRACIÓN (USAR UNA SOLA VEZ)
// ==========================================
app.get('/migrar-datos-ahora', async (req, res) => {
    try {
        // 1. Obtener todos los nombres distintos de la colección de Cotizaciones
        // (Esto es lo que hacías antes, recuperar solo los nombres)
        const nombresClientes = await Cotizacion.distinct("cliente");
        
        let contados = 0;
        let existentes = 0;

        // 2. Recorrer cada nombre encontrado
        for (const nombreViejo of nombresClientes) {
            
            // Verificamos que el nombre no esté vacío
            if (!nombreViejo) continue; 

            // 3. Revisar si ya existe en la nueva colección de Clientes
            // (Para no duplicarlos si recargas la página)
            const existe = await Cliente.findOne({ nombre: nombreViejo });

            if (!existe) {
                // 4. Si no existe, CREAMOS el cliente nuevo
                await Cliente.create({
                    nombre: nombreViejo,
                    tipo: 'Cliente',      // Asumimos que es cliente porque ya tiene cotización
                    canal: 'Histórico',   // Para saber que vino de la migración
                    email: '',            // Campos vacíos para llenar después
                    telefono: '',
                    fechaRegistro: new Date()
                });
                contados++;
                console.log(`✅ Migrado: ${nombreViejo}`);
            } else {
                existentes++;
            }
        }

        res.send(`
            <h1>✅ Migración Completada</h1>
            <p>Se encontraron <strong>${nombresClientes.length}</strong> nombres en el historial.</p>
            <ul>
                <li style="color:green">Nuevos clientes creados: <strong>${contados}</strong></li>
                <li style="color:blue">Clientes que ya existían (omitidos): <strong>${existentes}</strong></li>
            </ul>
            <a href="/clientes.html">Ir al Directorio de Clientes</a>
        `);

    } catch (error) {
        console.error("Error en migración:", error);
        res.status(500).send("<h1>❌ Error en la migración</h1><p>" + error.message + "</p>");
    }
});



// ==========================================
//           ZONA DE COTIZACIONES (ACTUALIZADA)
// ==========================================

// 👇👇 AQUÍ ESTÁ EL CAMBIO IMPORTANTE: NUEVO SCHEMA MULTI-PRODUCTO 👇👇
const cotizacionSchema = new mongoose.Schema({
    // Datos Generales de la Cotización
    cliente: String,
    quienCotiza: String,
    fecha: { type: Date, default: Date.now },
    estatus: { type: String, default: 'Emitida' },

    // LISTA DE PRODUCTOS (Array de objetos)
    items: [{
        producto: String,
        tela: String,
        color: String,
     
        medidas: {
            ancho: Number,
            alto: Number,
            areaCobrada: Number
        },
        cantidad: Number,
        motor: String,
        accesorios: {
            color: String,
            mando: String
        },
        financiero: {
            costoBase: Number,
            utilidad: Number,
            descuento: Number
        },
        precioUnitario: Number,
        total: Number
        
    }],

    // Datos Financieros Globales
    gastosAdicionales: [{
        descripcion: String,
        monto: Number
    }],
    descuentoGlobalPct: Number,    // <<< AGREGAR
    descuentoGlobalMonto: Number,  // <<< AGREGAR
    totalGastosAdicionales: Number,
    iva: Number,
    total: Number // Gran Total
});
// 👆👆 FIN DEL CAMBIO 👆👆

const Cotizacion = mongoose.model('Cotizacion', cotizacionSchema);

// Ruta para GUARDAR
app.post('/cotizaciones', async (req, res) => {
    try {
        console.log("📝 Recibiendo nueva cotización multi-producto...");
        const nuevaCotizacion = new Cotizacion(req.body);
        await nuevaCotizacion.save();
        console.log("✅ Cotización guardada con éxito.");
        res.json({ exito: true, mensaje: "Cotización guardada correctamente" });
    } catch (error) {
        console.error("Error al guardar:", error);
        res.status(500).json({ exito: false, mensaje: "Error en el servidor" });
    }
});


                // Ruta para EDITAR (ACTUALIZAR)
app.put('/cotizaciones', async (req, res) => {
    try {
        const { id, ...datosActualizados } = req.body;
        
        console.log(`📝 Actualizando cotización ID: ${id}`);

        // Buscamos la cotización y actualizamos solo los campos enviados
        const resultado = await Cotizacion.findByIdAndUpdate(id, datosActualizados, { new: true });

        if (resultado) {
            console.log("✅ Cotización actualizada con éxito.");
            res.json({ exito: true, mensaje: "Actualización correcta" });
        } else {
            console.log("⚠️ No se encontró la cotización.");
            res.status(404).json({ exito: false, mensaje: "Cotización no encontrada" });
        }
    } catch (error) {
        console.error("❌ Error al actualizar:", error);
        res.status(500).json({ exito: false, mensaje: "Error interno del servidor" });
    }
});



// Ruta para VER HISTORIAL
app.get('/cotizaciones', async (req, res) => {
    const historial = await Cotizacion.find().sort({ fecha: -1 });
    res.json(historial);
});

// 1. LEER CLIENTES (GET)
app.get('/clientes', async (req, res) => {
    try {
        // Ahora buscamos en la colección de Clientes, no en cotizaciones
        const listaClientes = await Cliente.find().sort({ nombre: 1 });
        res.json(listaClientes);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener clientes" });
    }
});

// 2. CREAR CLIENTE (POST)
app.post('/clientes', async (req, res) => {
    try {
        console.log("👤 Registrando nuevo cliente:", req.body.nombre);
        const nuevoCliente = new Cliente(req.body);
        await nuevoCliente.save();
        res.json({ exito: true, mensaje: "Cliente registrado" });
    } catch (error) {
        console.error("Error al guardar cliente:", error);
        res.status(500).json({ exito: false, mensaje: "Error al guardar" });
    }
});

// 3. ACTUALIZAR CLIENTE (PUT)
app.put('/clientes', async (req, res) => {
    try {
        const { id, ...datos } = req.body; // Separamos el ID de los datos
        console.log("✏️ Editando cliente ID:", id);
        
        await Cliente.findByIdAndUpdate(id, datos);
        res.json({ exito: true, mensaje: "Cliente actualizado" });
    } catch (error) {
        console.error("Error al actualizar cliente:", error);
        res.status(500).json({ exito: false, mensaje: "Error al actualizar" });
    }
});

// 4. ELIMINAR CLIENTE (DELETE)
app.delete('/clientes', async (req, res) => {
    const { id, password } = req.body;

    try {
        // VERIFICACIÓN DE CONTRASEÑA
        // Opción A: Verificar contra el usuario Admin de la base de datos (Más seguro)
        const esAdmin = await Usuario.findOne({ usuario: "admin", clave: password });
        
        // Opción B: Si prefieres verificar directo el "1234" sin buscar usuario, usa esta línea en vez de la anterior:
        // const esAdmin = (password === "1234");

        if (!esAdmin) {
            return res.status(401).json({ exito: false, mensaje: "⛔ Contraseña incorrecta." });
        }

        // Si la contraseña es correcta, borramos
        await Cliente.findByIdAndDelete(id);
        console.log(`🗑️ Cliente eliminado ID: ${id}`);
        
        res.json({ exito: true, mensaje: "Cliente eliminado correctamente." });

    } catch (error) {
        console.error("Error al borrar cliente:", error);
        res.status(500).json({ exito: false, mensaje: "Error al borrar en servidor." });
    }
});



// Ruta para BORRAR
app.delete('/cotizaciones', async (req, res) => {
    const { id, password } = req.body;
    try {
        const esAdmin = await Usuario.findOne({ usuario: "admin", clave: password });
        if (!esAdmin) return res.json({ exito: false, mensaje: "⛔ Contraseña incorrecta." });

        await Cotizacion.findByIdAndDelete(id);
        res.json({ exito: true, mensaje: "Cotización eliminada correctamente." });
    } catch (error) {
        res.status(500).json({ exito: false, mensaje: "Error al borrar." });
    }
});


// ==========================================
//              ZONA DE MOTORES
// ==========================================
const motorSchema = new mongoose.Schema({ nombre: String, precio: Number });
const Motor = mongoose.model('Motor', motorSchema);

app.get('/motores', async (req, res) => {
    try {
        const motores = await Motor.find({});
        res.json(motores);
    } catch (error) {
        res.status(500).send({ error: 'Error al obtener motores' });
    }
});


// ==========================================
//              ZONA DE COLORES
// ==========================================
const colorSchema = new mongoose.Schema({
    nombre: String,
    telaNombre: String
});
const Color = mongoose.model('Color', colorSchema);

app.get('/colores', async (req, res) => {
    try {
        const colores = await Color.find();
        res.json(colores);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener colores" });
    }
});


// ==========================================
//               ZONA DE TELAS
// ==========================================
const telaSchema = new mongoose.Schema({
    nombre: String,
    precioExtra: Number,
    productos: [String]
});
const Tela = mongoose.model('Tela', telaSchema);

app.get('/telas', async (req, res) => {
    try {
        const telas = await Tela.find();
        res.json(telas);
    } catch (error) {
        res.status(500).send("Error al obtener telas");
    }
});


// ==========================================
//        RUTAS PROTEGIDAS (HTML)
// ==========================================
app.get('/inicio.html', protegerRuta, (req, res) => res.sendFile(path.join(__dirname, 'privado', 'inicio.html')));
app.get('/cotizaciones.html', protegerRuta, (req, res) => res.sendFile(path.join(__dirname, 'privado', 'cotizaciones.html')));
app.get('/clientes.html', protegerRuta, (req, res) => res.sendFile(path.join(__dirname, 'privado', 'clientes.html')));
app.get('/productos.html', protegerRuta, (req, res) => res.sendFile(path.join(__dirname, 'privado', 'productos.html')));
app.get('/control-cotizaciones.html', protegerRuta, (req, res) => res.sendFile(path.join(__dirname, 'privado', 'control-cotizaciones.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor listo y escuchando en el puerto ${PORT}`);
});