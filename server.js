// server.js - Versión con Usuarios y Productos
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());
// Esto hace que Node.js sirva tus archivos HTML automáticamente
app.use(express.static('public'));
// ----------------

// ... AQUÍ SIGUE TU CÓDIGO DE MONGODB IGUAL QUE ANTES ...
// (No borres tu conexión a la base de datos ni tus rutas)

const uri = "mongodb+srv://lalomirandarr_2005:Lalette2005.@cluster0.tzwlyxr.mongodb.net/?appName=Cluster0";


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

app.post('/login', async (req, res) => {
    const { usuario, password } = req.body;
    const encontrado = await Usuario.findOne({ usuario: usuario, clave: password });
    if (encontrado) res.json({ exito: true });
    else res.json({ exito: false });
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

// ==========================================

const PORT = 3000;
// ==========================================
//           ZONA DE COTIZACIONES (NUEVO)
// ==========================================

// 1. El Molde (Schema) de la Cotización
const cotizacionSchema = new mongoose.Schema({
    cliente: String,
    producto: String,
    tela: String,
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



app.listen(PORT, () => console.log(`Servidor listo en http://localhost:${PORT}`));