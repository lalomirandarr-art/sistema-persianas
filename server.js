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
        descuentoGlobalPct: Number,   // Ejemplo: 10 (por 10%)
    descuentoGlobalMonto: Number, // Ejemplo: 500.00 (pesos)
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

// Ruta para DIRECTORIO CLIENTES
app.get('/clientes', async (req, res) => {
    try {
        const listaClientes = await Cotizacion.distinct("cliente");
        listaClientes.sort();
        res.json(listaClientes);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener clientes" });
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