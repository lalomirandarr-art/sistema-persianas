
require('dotenv').config(); 


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
//           ZONA DE COTIZACIONES (ACTUALIZADA)
// ==========================================

// 👇👇 AQUÍ ESTÁ EL CAMBIO IMPORTANTE: NUEVO SCHEMA MULTI-PRODUCTO 👇👇
const cotizacionSchema = new mongoose.Schema({
    // Datos Generales de la Cotización
    cliente: String,
    quienCotiza: String,
    pctUtilidad: Number,
    fecha: { type: Date, default: Date.now },
    estatus: { type: String, default: 'Emitida' },
      

    // LISTA DE PRODUCTOS (Array de objetos)
    items: [{
        producto: String,
        tela: String,
        color: String,
        notas: String,       
        control: String,     
        componente: String,
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

    pagos: [{
        fechaPago: Date,
        monto: Number,
        tipoPago: String, // 'Efectivo' o 'Transferencia'
        fechaRegistro: { type: Date, default: Date.now } // Para saber cuándo se capturó
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


// --- RUTA PARA REGISTRAR UN PAGO ---
app.post('/cotizaciones/:id/pagos', async (req, res) => {
    const { id } = req.params;
    // Datos que vienen del formulario del modal
    const { fechaPago, monto, tipoPago } = req.body;

    if (!monto || isNaN(monto) || monto <= 0) {
        return res.status(400).json({ exito: false, mensaje: "Monto inválido" });
    }
    if (!fechaPago || !tipoPago) {
        return res.status(400).json({ exito: false, mensaje: "Faltan datos del pago" });
    }

    try {
        // 1. Buscamos la cotización
        const cotizacion = await Cotizacion.findById(id);
        if (!cotizacion) {
            return res.status(404).json({ exito: false, mensaje: "Cotización no encontrada" });
        }

        // 2. Creamos el objeto de pago
        const nuevoPago = {
            fechaPago: new Date(fechaPago),
            monto: parseFloat(monto),
            tipoPago: tipoPago
        };

        // 3. Agregamos el pago al array 'pagos'
        cotizacion.pagos.push(nuevoPago);

        // 4. Guardamos la cotización actualizada
        await cotizacion.save();

        res.json({ exito: true, mensaje: "Pago registrado correctamente", pagos: cotizacion.pagos });

    } catch (error) {
        console.error("Error registrando pago:", error);
        res.status(500).json({ exito: false, mensaje: "Error en el servidor al guardar el pago" });
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
// 1. LEER CLIENTES (GET) - CON PAGINACIÓN Y BÚSQUEDA
app.get('/clientes', async (req, res) => {
    try {
        // Recoger parámetros de la URL (página, límite, búsqueda)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || "";

        // Crear filtro de búsqueda
        let query = {};
        if (search) {
            query = {
                $or: [
                    { nombre: { $regex: search, $options: 'i' } },
                    { razonSocial: { $regex: search, $options: 'i' } }
                ]
            };
        }

        // 1. Contar total de resultados (para saber cuántas páginas hay)
        const totalDocumentos = await Cliente.countDocuments(query);
        
        // 2. Obtener solo los clientes de la página actual
        const listaClientes = await Cliente.find(query)
            .sort({ nombre: 1 }) // Ordenar alfabéticamente
            .skip((page - 1) * limit)
            .limit(limit);

        // 3. Enviar PAQUETE COMPLETO (Esto es lo que tu HTML espera)
        res.json({
            datos: listaClientes,
            total: totalDocumentos,
            paginaActual: page,
            totalPaginas: Math.ceil(totalDocumentos / limit)
        });

    } catch (error) {
        console.error(error);
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
// --- NUEVOS ESQUEMAS PARA MONGOOSE ---

// Esquema para Controles (Mandos)
const ControlSchema = new mongoose.Schema({
    nombre: String,
    precio: Number
});
const Control = mongoose.model('Control', ControlSchema);

// Esquema para Componentes Extra (Hubs, Soportes, etc.)
const ComponenteSchema = new mongoose.Schema({
    nombre: String,
    precio: Number
});
const Componente = mongoose.model('Componente', ComponenteSchema);

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
// Ruta nueva (CREAR / GUARDAR)
app.post('/colores', async (req, res) => {
    try {
        // Recibimos los datos que envía el Modal
        const { nombre, telaNombre } = req.body;

        console.log(`🎨 Guardando nuevo color: ${nombre} para tela: ${telaNombre}`);

        // Creamos el nuevo color en la base de datos
        const nuevoColor = new Color({
            nombre: nombre,
            telaNombre: telaNombre
        });

        await nuevoColor.save();

        // Respondemos al navegador con éxito y los datos del color creado
        res.json({ exito: true, mensaje: "Color guardado", nuevoColor: nuevoColor });

    } catch (error) {
        console.error("Error al guardar color:", error);
        res.status(500).json({ exito: false, mensaje: "Error al guardar en el servidor" });
    }
});

// ==========================================
//               ZONA DE TELAS
// ==========================================
const telaSchema = new mongoose.Schema({
    nombre: String,
    // Array de configuraciones: Cada objeto vincula un producto con su precio específico
    configuraciones: [{
        producto: String, // Nombre del producto (ej: "Persiana Sheer")
        precio: Number    // Precio específico para ESTE producto
    }]
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
// 🚀 ZONA DE MIGRACIÓN (EJECUTAR UNA VEZ)
// ==========================================
app.get('/migrar-datos-ahora', async (req, res) => {
    try {
        console.log("🚀 Iniciando migración de clientes...");
        
        // 1. Obtener todos los nombres únicos de las cotizaciones
        const nombresEnCotizaciones = await Cotizacion.distinct("cliente");
        
        let agregados = 0;
        let yaExistian = 0;

        // 2. Recorrer cada nombre y crearlo si no existe
        for (const nombreViejo of nombresEnCotizaciones) {
            if (!nombreViejo) continue; // Saltar vacíos

            // Buscamos si ya existe en la NUEVA colección de Clientes
            const existe = await Cliente.findOne({ nombre: nombreViejo });

            if (!existe) {
                // Si no existe, lo creamos
                await Cliente.create({
                    nombre: nombreViejo,
                    tipo: 'Cliente',      // Asumimos que es cliente
                    canal: 'Histórico',   // Etiqueta para saber que viene de la migración
                    fechaRegistro: new Date()
                });
                agregados++;
                console.log(`✅ Agregado: ${nombreViejo}`);
            } else {
                yaExistian++;
            }
        }

        res.send(`
            <div style="font-family: sans-serif; padding: 50px;">
                <h1 style="color: green;">✅ ¡Migración Completada!</h1>
                <p>Se analizaron las cotizaciones antiguas.</p>
                <ul>
                    <li>Nuevos clientes recuperados: <strong>${agregados}</strong></li>
                    <li>Clientes que ya existían: <strong>${yaExistian}</strong></li>
                </ul>
                <a href="/clientes.html" style="font-size: 1.2em; font-weight: bold;">Ir a mi Directorio de Clientes ➡</a>
            </div>
        `);

    } catch (error) {
        console.error("❌ Error en migración:", error);
        res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
    }
});

// --- NUEVAS RUTAS GET ---

app.get('/controles', async (req, res) => {
    try {
        const items = await Control.find();
        res.json(items);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/componentes', async (req, res) => {
    try {
        const items = await Componente.find();
        res.json(items);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/telas', async (req, res) => {
    try {
        // req.body espera: { nombre: "Screen", configuraciones: [{ producto: "X", precio: 100 }, ...] }
        const nuevaTela = new Tela(req.body);
        await nuevaTela.save();
        res.json({ exito: true, mensaje: "Tela guardada con precios dinámicos" });
    } catch (error) {
        res.status(500).json({ error: "Error al guardar tela" });
    }
});


// ==========================================
// 🚑 ZONA DE REPARACIÓN DE TELAS (EJECUTAR SOLO UNA VEZ)
// ==========================================
async function migrarTelasAlNuevoFormato() {
    console.log("🔄 Comprobando formato de telas...");
    
    // Buscamos telas que tengan la propiedad vieja 'precioExtra'
    // (Usamos .lean() para obtener objetos JS puros y poder manipularlos)
    const telasViejas = await Tela.find({ precioExtra: { $exists: true } }).lean();

    if (telasViejas.length === 0) {
        console.log("✅ Todas las telas ya tienen el formato nuevo.");
        return;
    }

    console.log(`⚠️ Encontradas ${telasViejas.length} telas con formato antiguo. Migrando...`);

    for (const tela of telasViejas) {
        // 1. Crear el nuevo array de configuraciones basado en los datos viejos
        const nuevasConfiguraciones = [];

        // Si la tela tenía productos asignados, le ponemos el precio viejo a cada uno
        if (tela.productos && tela.productos.length > 0) {
            tela.productos.forEach(prodNombre => {
                nuevasConfiguraciones.push({
                    producto: prodNombre,
                    precio: tela.precioExtra || 0 // Usamos el precio viejo
                });
            });
        }

        // 2. Actualizamos la tela en la BD
        // $unset elimina los campos viejos, $set pone los nuevos
        await Tela.updateOne(
            { _id: tela._id },
            { 
                $set: { configuraciones: nuevasConfiguraciones },
                $unset: { precioExtra: "", productos: "" } 
            }
        );
        console.log(`🛠️ Tela migrada: ${tela.nombre}`);
    }
    console.log("🎉 Migración de telas finalizada.");
}

// Llama a la función al iniciar (comentar después de usar)
 // setTimeout(() => { migrarTelasAlNuevoFormato(); }, 5000);



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