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

// ==========================================
//          ZONA DE MOTORES (NUEVO)
// ==========================================

// 1. El Molde (Schema) - Definimos qué datos tiene un motor
const motorSchema = new mongoose.Schema({
    nombre: String,
    precio: Number
});

// Creamos el Modelo (esto crea la colección 'motors' en MongoDB automáticamente)
const Motor = mongoose.model('Motor', motorSchema);

// 2. Llenar la base de datos (Solo si está vacía)
// Esto es genial porque la primera vez que guardes y reinicies, 
// te subirá estos motores a MongoDB Atlas solito.
async function inicializarMotores() {
    try {
        const cantidad = await Motor.countDocuments();
        if (cantidad === 0) {
            console.log("⚙️ Base de datos de motores vacía. Creando iniciales...");
            await Motor.insertMany([
                { nombre: "Motor Básico", precio: 1500 },
                { nombre: "Motor WiFi / Alexa", precio: 2800 },
                { nombre: "Motor Silencioso Premium", precio: 4500 }
            ]);
            console.log("✅ Motores agregados exitosamente.");
        }
    } catch (error) {
        console.error("Error inicializando motores:", error);
    }
}
inicializarMotores();

// 3. La Ruta (El API que consultará tu página web)
app.get('/api/motores', async (req, res) => {
    try {
        const motores = await Motor.find({}); // Busca todos los motores
        res.json(motores); // Se los envía al frontend
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener motores' });
    }
});

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
// Agrega esto en tu server.js, antes de app.listen(...)

app.get('/api/motores', async (req, res) => {
    try {
        // 1. Accedemos a la colección "motores"
        // NOTA: Asegúrate de que 'db' es la variable de tu conexión a Mongo. 
        // Si usas Mongoose, sería: await ModeloMotor.find({});
        const collection = db.collection('motores'); 
        
        // 2. Buscamos todos los motores y los convertimos a un array
        const motores = await collection.find({}).toArray();
        
        // 3. Enviamos la lista al frontend
        res.json(motores);
    } catch (error) {
        console.error("Error obteniendo motores:", error);
        res.status(500).send("Error en el servidor");
    }
});


app.listen(PORT, () => console.log(`Servidor listo en http://localhost:${PORT}`));