
// Agrega esta línea HASTA ARRIBA, antes de const express...
require('dotenv').config(); 

// ... el resto de tus imports ...

// server.js - Versión con Usuarios y Productos
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path'); // <--- AGREGA ESTO AL PRINCIPIO

const app = express();
/** seguridad */

// --- CONFIGURACIÓN DE SESIÓN ---
// Busca donde dice secret: 'Ingegarcia' y cámbialo por:
app.use(session({
    secret: process.env.SESSION_SECRET, // <--- Lee del archivo oculto
    // ..., // Cambia esto por una frase secreta tuya
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, 
    maxAge: 1000*60*60
    } // 
    
}));

// --- MIDDLEWARE DE PROTECCIÓN (El Guardia de Seguridad) ---
function protegerRuta(req, res, next) {
    if (req.session && req.session.usuario) {
        // Si tiene credencial, pase usted
        return next();
    } else {
        // Si no, ¡fuera! Redirigir al login
        res.redirect('/index.html');
    }
}




app.use(cors());
app.use(express.json());
// Esto hace que Node.js sirva tus archivos HTML automáticamente
app.use(express.static('public'));
// ----------------

// ... AQUÍ SIGUE TU CÓDIGO DE MONGODB IGUAL QUE ANTES ...
// (No borres tu conexión a la base de datos ni tus rutas)

const uri = process.env.MONGODB_URI;


mongoose.connect(uri)
    .then(() => console.log("✅ Conectado a la Nube"))
    .catch(e => console.error("❌ Error:", e));


// ==========================================
//              ZONA DE USUARIOS
// ==========================================
const usuarioSchema = new mongoose.Schema({ usuario: String, clave: String });
const Usuario = mongoose.model('Usuario', usuarioSchema);

// Crear admin si no existe
async function crearAdmin() {
    if (await Usuario.countDocuments() === 0) {
        await Usuario.create({ usuario: "admin", clave: "1234" });
        console.log("👤 Usuario admin creado.");
    }
}
crearAdmin();

// --- RUTA DE LOGIN ACTUALIZADA (Paso 3) ---
app.post('/login', async (req, res) => {
    const { usuario, password } = req.body;
    
    // 1. Buscamos en la base de datos
    const encontrado = await Usuario.findOne({ usuario: usuario, clave: password });
    
    if (encontrado) {
        // 2. ¡AQUÍ ESTÁ LA CLAVE! Guardamos al usuario en la "memoria" del servidor
        req.session.usuario = usuario; 
        
        // 3. Avisamos que todo salió bien
        res.json({ exito: true });
    } else {
        res.json({ exito: false });
    }
});

// --- RUTA DE LOGOUT (Para cerrar sesión) ---
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        // Borramos la memoria y mandamos al login
        res.redirect('/index.html'); 
    });
});


// ==========================================
//              ZONA DE PRODUCTOS (NUEVO)
// ==========================================

// 1. El Molde (Schema)
const productoSchema = new mongoose.Schema({
    nombre: String,
    precio: Number
});
const Producto = mongoose.model('Producto', productoSchema);

// 2. Llenar la tienda (Solo si está vacía)
async function inicializarProductos() {
    const cantidad = await Producto.countDocuments();
    if (cantidad === 0) {
        console.log("📦 Base de datos de productos vacía. Creando iniciales...");
        await Producto.insertMany([
            { nombre: "Persiana Sheer Elegance", precio: 1200 },
            { nombre: "Persiana Blackout Premium", precio: 850 },
            { nombre: "Cortina Enrollable Solar", precio: 950 },
            { nombre: "Motorización Básica", precio: 2500 }
        ]);
        console.log("✅ Productos agregados exitosamente.");
    }
}
inicializarProductos();


// 3. La Ruta (El HTML llamará aquí para pedir la lista)
app.get('/productos', async (req, res) => {
    try {
        const listaProductos = await Producto.find(); // Busca TODOS en MongoDB
        res.json(listaProductos); // Se los envía al HTML
    } catch (error) {
        res.status(500).json({ error: "Error al obtener productos" });
    }
});

// Ruta para VER LA LISTA DE PRODUCTOS
app.get('/productos.html', protegerRuta, (req, res) => {
    res.sendFile(path.join(__dirname, 'privado', 'productos.html'));
});

// ==========================================

const PORT = process.env.PORT || 3000;
// ==========================================
//           ZONA DE COTIZACIONES (NUEVO)
// ==========================================

// 1. El Molde (Schema) de la Cotización
const cotizacionSchema = new mongoose.Schema({
    cliente: String,
    producto: String,
    tela: String,
    quienCotiza: String,
    medidas: {
        ancho: Number,
        alto: Number
    },
    cantidad: Number,
    // --- NUEVOS CAMPOS ---
    costoNeto: Number,      // Precio sin utilidad
    porcentajeUtilidad: Number, // El porcentaje elegido (ej: 50)
    precioConUtilidad: Number,  // El precio de venta
    porcentajeDescuento: Number,
    iva: Number,
    color: String,
gastosAdicionales: [{
        descripcion: String,
        monto: Number
    }],
    totalGastosAdicionales: Number,
    
    // --------------------
    total: Number, // Este será el Gran Total (con IVA si decides dejarlo)
    fecha: { type: Date, default: Date.now }
});
// ESTA ES LA LÍNEA QUE FALTA:
const Cotizacion = mongoose.model('Cotizacion', cotizacionSchema);

// 2. La Ruta para GUARDAR (Recibe datos del HTML)
app.post('/cotizaciones', async (req, res) => {
    try {
        console.log("📝 Recibiendo nueva cotización...");
        // Creamos la nueva cotización con los datos que llegaron
        const nuevaCotizacion = new Cotizacion(req.body);
        
        // La guardamos en MongoDB
        await nuevaCotizacion.save();
        
        console.log("✅ Cotización guardada con éxito.");
        res.json({ exito: true, mensaje: "Cotización guardada correctamente" });
    } catch (error) {
        console.error("Error al guardar:", error);
        res.status(500).json({ exito: false, mensaje: "Error en el servidor" });
    }
});

// 3. La Ruta para VER (La usaremos después en el historial)
app.get('/cotizaciones', async (req, res) => {
    const historial = await Cotizacion.find().sort({ fecha: -1 }); // Las más nuevas primero
    res.json(historial);
});
// --- NUEVA RUTA: DIRECTORIO DE CLIENTES ---
app.get('/clientes', async (req, res) => {
    try {
        // 1. "distinct" busca todos los valores únicos del campo "cliente"
        // (Si Juan Pérez compró 5 veces, solo saldrá 1 vez)
        const listaClientes = await Cotizacion.distinct("cliente");
        
        // 2. Ordenamos alfabéticamente
        listaClientes.sort();

        // 3. Enviamos la lista al navegador
        res.json(listaClientes);
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener clientes" });
    }
});

// ==========================================
//          ZONA DE MOTORES (NUEVO)
// ==========================================

// 1. El Molde (Schema)
const motorSchema = new mongoose.Schema({
    nombre: String,
    precio: Number
});

const Motor = mongoose.model('Motor', motorSchema);


// 3. La Ruta (API) para que la página web pida la lista
app.get('/motores', async (req, res) => {
    try {
        const motores = await Motor.find({}); // Busca todos
        res.json(motores); // Se los envía al HTML
    } catch (error) {
        res.status(500).send({ error: 'Error al obtener motores' });
    }
});

//colorschema//

// ==========================================
//              ZONA DE COLORES (NUEVO)
// ==========================================

// 1. El Molde (Schema)
// Guardamos el nombre del color y el nombre EXACTO de la tela a la que pertenece
const colorSchema = new mongoose.Schema({
    nombre: String,      // Ej: "Blanco Puro"
    telaNombre: String   // Ej: "Tela Sheer White" (Debe coincidir con la BD de Telas)
});

const Color = mongoose.model('Color', colorSchema);

// 2. La Ruta (API) para obtener colores
app.get('/colores', async (req, res) => {
    try {
        const colores = await Color.find();
        res.json(colores);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener colores" });
    }
});




// --- NUEVA RUTA: BORRAR COTIZACIÓN (CON SEGURIDAD) ---
app.delete('/cotizaciones', async (req, res) => {
    const { id, password } = req.body; // Recibimos ID y Contraseña

    try {
        // 1. Verificamos si la contraseña pertenece al admin
        // (Usamos el modelo 'Usuario' que creamos al principio)
        const esAdmin = await Usuario.findOne({ usuario: "admin", clave: password });

        if (!esAdmin) {
            // Si no encuentra al admin con esa clave, rechazamos
            return res.json({ exito: false, mensaje: "⛔ Contraseña incorrecta. No tienes permiso." });
        }

        // 2. Si la contraseña es correcta, procedemos a borrar
        await Cotizacion.findByIdAndDelete(id);
        
        console.log(`🗑️ Cotización ${id} eliminada por admin.`);
        res.json({ exito: true, mensaje: "Cotización eliminada correctamente." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ exito: false, mensaje: "Error en el servidor al intentar borrar." });
    }
});

const telaSchema = new mongoose.Schema({
    nombre: String,
    precioExtra: Number // El costo extra que se suma (ej: 0 o 100)
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
//        ZONA DE RUTAS PROTEGIDAS 
// ==========================================

// Ruta para el INICIO
app.get('/inicio.html', protegerRuta, (req, res) => {
    res.sendFile(path.join(__dirname, 'privado', 'inicio.html'));
});

// Ruta para COTIZACIONES
app.get('/cotizaciones.html', protegerRuta, (req, res) => {
    res.sendFile(path.join(__dirname, 'privado', 'cotizaciones.html'));
});

// Ruta para CLIENTES
app.get('/clientes.html', protegerRuta, (req, res) => {
    res.sendFile(path.join(__dirname, 'privado', 'clientes.html'));
});

// Ruta para CONTROL DE COTIZACIONES (si tienes este archivo)
app.get('/control-cotizaciones.html', protegerRuta, (req, res) => {
    res.sendFile(path.join(__dirname, 'privado', 'control-cotizaciones.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor listo y escuchando en el puerto ${PORT}`);
});