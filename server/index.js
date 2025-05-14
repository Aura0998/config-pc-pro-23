
// server/index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const DEBUG_FILTERS = process.env.DEBUG_FILTERS === 'true';

const COLLECTIONS = {
    case: 'productos_procesados/case_productos',
    cpu: 'productos_procesados/processor_productos',
    gpu: 'productos_procesados/graphic-card_productos',
    memory: 'productos_procesados/memory_productos',
    motherboard: 'productos_procesados/motherboard_productos',
    'power-supply': 'productos_procesados/power-supply_productos',
    storage: 'productos_procesados/storage_productos',
    cooler: 'productos_procesados/cooler_productos',
};

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Conectado a MongoDB'))
    .catch(err => console.error('❌ Error conectando a MongoDB:', err));

// Helper function to extract numeric value from a string field
function extractNumericValue(value) {
    if (typeof value === 'number') return value;
    if (!value || typeof value !== 'string') return null;
    
    // Try to extract numbers like "4.70" from strings like "4.70 GHz"
    const match = value.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
}

// Helper function to create a MongoDB pipeline stage for numeric range filtering
function createNumericRangeStage(fieldPaths, minValue, maxValue) {
    const conditions = fieldPaths.map(path => ({
        $let: {
            vars: {
                extractedValue: {
                    $cond: {
                        if: { $eq: [{ $type: `$${path}` }, "number"] },
                        then: `$${path}`,
                        else: {
                            $cond: {
                                if: { $eq: [{ $type: `$${path}` }, "string"] },
                                then: {
                                    $toDouble: {
                                        $replaceAll: {
                                            input: { 
                                                $regexFind: { 
                                                    input: { $ifNull: [`$${path}`, ""] }, 
                                                    regex: /(\d+(\.\d+)?)/ 
                                                }.match 
                                            },
                                            find: " ",
                                            replacement: ""
                                        }
                                    }
                                },
                                else: null
                            }
                        }
                    }
                }
            },
            in: {
                $and: [
                    { $gte: ["$$extractedValue", minValue] },
                    { $lte: ["$$extractedValue", maxValue] }
                ]
            }
        }
    }));

    return { $match: { $or: conditions } };
}

app.get('/api/components/:category', async (req, res) => {
    const { category } = req.params;
    const collName = COLLECTIONS[category];
    if (!collName) {
        return res.status(404).json({ error: 'Categoría no válida' });
    }
    
    try {
        // Log all incoming filter parameters for debugging
        console.log('Received query params:', req.query);
        
        // Start with an empty pipeline
        const pipeline = [];
        let useAggregation = false;
        
        // Aplicar filtros específicos según la categoría
        if (req.query) {
            // Filtro general por nombre para todas las categorías
            if (req.query.name) {
                console.log(`Applying name filter: ${req.query.name}`);
                pipeline.push({ 
                    $match: { 
                        Nombre: { $regex: new RegExp(req.query.name, 'i') } 
                    }
                });
                useAggregation = true;
            }
            
            // Filtros para CPU
            if (category === 'cpu') {
                // Filtro de marca
                if (req.query.processorBrand) {
                    const brand = req.query.processorBrand.toLowerCase();
                    console.log(`Applying CPU brand filter: ${brand}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { Nombre: { $regex: brand, $options: 'i' } },
                                { Marca: { $regex: brand, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de socket
                if (req.query.socket || req.query.enchufe) {
                    const socketValue = req.query.socket || req.query.enchufe;
                    if (socketValue && socketValue !== '') {
                        console.log(`Applying CPU socket filter: ${socketValue}`);
                        
                        pipeline.push({
                            $match: {
                                $or: [
                                    { 'Características.Enchufe': { $regex: socketValue, $options: 'i' } },
                                    { 'Características.Socket': { $regex: socketValue, $options: 'i' } }
                                ]
                            }
                        });
                        useAggregation = true;
                    }
                }
                
                // Filtro de núcleos
                if (req.query.nucleos && Array.isArray(req.query.nucleos) && req.query.nucleos.length === 2) {
                    const minCores = parseInt(req.query.nucleos[0]);
                    const maxCores = parseInt(req.query.nucleos[1]);
                    console.log(`Applying CPU cores filter: ${minCores} - ${maxCores}`);
                    
                    // Add numeric range filter for cores
                    pipeline.push(createNumericRangeStage([
                        'Características.Núcleos', 
                        'nucleos'
                    ], minCores, maxCores));
                    useAggregation = true;
                }
                
                // Filtro de frecuencia base
                if (req.query.reloj_base && Array.isArray(req.query.reloj_base) && req.query.reloj_base.length === 2) {
                    const minFreq = parseFloat(req.query.reloj_base[0]);
                    const maxFreq = parseFloat(req.query.reloj_base[1]);
                    console.log(`Applying CPU base clock filter: ${minFreq} - ${maxFreq}`);
                    
                    // Add numeric range filter for base clock
                    pipeline.push(createNumericRangeStage([
                        'Características.Reloj base', 
                        'reloj_base'
                    ], minFreq, maxFreq));
                    useAggregation = true;
                }
                
                // Filtro de TDP
                if (req.query.tdp && Array.isArray(req.query.tdp) && req.query.tdp.length === 2) {
                    const minTDP = parseInt(req.query.tdp[0]);
                    const maxTDP = parseInt(req.query.tdp[1]);
                    console.log(`Applying CPU TDP filter: ${minTDP} - ${maxTDP}`);
                    
                    // Add numeric range filter for TDP
                    pipeline.push(createNumericRangeStage([
                        'Características.TDP', 
                        'tdp'
                    ], minTDP, maxTDP));
                    useAggregation = true;
                }
                
                // Filtro de cooler incluido
                if (req.query.enfriador_incluido !== undefined) {
                    const hasIncludedCooler = req.query.enfriador_incluido === 'true';
                    console.log(`Applying CPU cooler included filter: ${hasIncludedCooler}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Enfriador incluido': hasIncludedCooler ? { $regex: /si|sí|yes|true/i } : { $regex: /no|false/i } },
                                { enfriador_incluido: hasIncludedCooler }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de GPU integrada
                if (req.query.gpu_integrada !== undefined) {
                    const hasIntegratedGPU = req.query.gpu_integrada === 'true';
                    console.log(`Applying CPU integrated GPU filter: ${hasIntegratedGPU}`);
                    
                    // Si hasIntegratedGPU es true, buscamos valores que NO sean "No"
                    // Si hasIntegratedGPU es false, buscamos valores que sean "No" o null
                    if (hasIntegratedGPU) {
                        pipeline.push({
                            $match: {
                                $or: [
                                    { 'Características.GPU integrada': { $exists: true, $ne: "No" } },
                                    { gpu_integrada: true }
                                ]
                            }
                        });
                    } else {
                        pipeline.push({
                            $match: {
                                $or: [
                                    { 'Características.GPU integrada': "No" },
                                    { 'Características.GPU integrada': { $exists: false } },
                                    { gpu_integrada: false },
                                    { gpu_integrada: { $exists: false } }
                                ]
                            }
                        });
                    }
                    
                    useAggregation = true;
                }
            }
            
            // Filtros para GPU
            if (category === 'gpu') {
                // Filtro de marca
                if (req.query.gpuBrand) {
                    const brand = req.query.gpuBrand.toLowerCase();
                    console.log(`Applying GPU brand filter: ${brand}`);
                    
                    let brandConditions = [];
                    
                    if (brand === 'nvidia') {
                        // For NVIDIA GPUs
                        brandConditions = [
                            { Nombre: { $regex: /nvidia/i } },
                            { Nombre: { $regex: /rtx/i } },
                            { Nombre: { $regex: /gtx/i } },
                            { Nombre: { $regex: /quadro/i } },
                            { Nombre: { $regex: /geforce/i } },
                            { Marca: { $regex: /nvidia/i } }
                        ];
                    } else if (brand === 'amd') {
                        // For AMD GPUs
                        brandConditions = [
                            { Nombre: { $regex: /amd/i } },
                            { Nombre: { $regex: /radeon/i } },
                            { Nombre: { $regex: /rx\s?\d/i } },
                            { Marca: { $regex: /amd/i } }
                        ];
                    } else {
                        // Generic brand search
                        brandConditions = [
                            { Nombre: { $regex: new RegExp(brand, 'i') } },
                            { Marca: { $regex: new RegExp(brand, 'i') } }
                        ];
                    }
                    
                    pipeline.push({ $match: { $or: brandConditions } });
                    useAggregation = true;
                }
                
                // Filtro de memoria VRAM
                if (req.query.memoria && Array.isArray(req.query.memoria) && req.query.memoria.length === 2) {
                    const minVRAM = parseInt(req.query.memoria[0]);
                    const maxVRAM = parseInt(req.query.memoria[1]);
                    console.log(`Applying GPU VRAM filter: ${minVRAM} - ${maxVRAM}`);
                    
                    // Add numeric range filter for VRAM
                    pipeline.push(createNumericRangeStage([
                        'Características.Memoria', 
                        'memoria'
                    ], minVRAM, maxVRAM));
                    useAggregation = true;
                }
                
                // Filtro de longitud de GPU
                if (req.query.longitud && Array.isArray(req.query.longitud) && req.query.longitud.length === 2) {
                    const minLength = parseInt(req.query.longitud[0]);
                    const maxLength = parseInt(req.query.longitud[1]);
                    console.log(`Applying GPU length filter: ${minLength} - ${maxLength}`);
                    
                    // Add numeric range filter for GPU length
                    pipeline.push(createNumericRangeStage([
                        'Características.Longitud', 
                        'longitud'
                    ], minLength, maxLength));
                    useAggregation = true;
                }
                
                // Filtro de tipo de memoria
                if (req.query.tipo_de_memoria && req.query.tipo_de_memoria !== '') {
                    console.log(`Applying GPU memory type filter: ${req.query.tipo_de_memoria}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Tipo de memoria': { $regex: req.query.tipo_de_memoria, $options: 'i' } },
                                { tipo_de_memoria: { $regex: req.query.tipo_de_memoria, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de interfaz
                if (req.query.interfaz && req.query.interfaz !== '') {
                    console.log(`Applying GPU interface filter: ${req.query.interfaz}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Interfaz': { $regex: req.query.interfaz, $options: 'i' } },
                                { interfaz: { $regex: req.query.interfaz, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de TDP
                if (req.query.tdp && Array.isArray(req.query.tdp) && req.query.tdp.length === 2) {
                    const minTDP = parseInt(req.query.tdp[0]);
                    const maxTDP = parseInt(req.query.tdp[1]);
                    console.log(`Applying GPU TDP filter: ${minTDP} - ${maxTDP}`);
                    
                    // Add numeric range filter for TDP
                    pipeline.push(createNumericRangeStage([
                        'Características.TDP', 
                        'tdp'
                    ], minTDP, maxTDP));
                    useAggregation = true;
                }
            }
            
            // Filtros para Motherboard
            if (category === 'motherboard') {
                // Filtro de factor de forma
                if (req.query.factor_de_forma && req.query.factor_de_forma !== '') {
                    console.log(`Applying motherboard form factor filter: ${req.query.factor_de_forma}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Factor de forma': { $regex: req.query.factor_de_forma, $options: 'i' } },
                                { factor_de_forma: { $regex: req.query.factor_de_forma, $options: 'i' } },
                                { 'Características.Formato': { $regex: req.query.factor_de_forma, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de socket
                if (req.query.socket || req.query.enchufe) {
                    const socketValue = req.query.socket || req.query.enchufe;
                    if (socketValue && socketValue !== '') {
                        console.log(`Applying motherboard socket filter: ${socketValue}`);
                        
                        pipeline.push({
                            $match: {
                                $or: [
                                    { 'Características.Socket': { $regex: socketValue, $options: 'i' } },
                                    { 'Características.Enchufe': { $regex: socketValue, $options: 'i' } },
                                    { enchufe: { $regex: socketValue, $options: 'i' } }
                                ]
                            }
                        });
                        useAggregation = true;
                    }
                }
                
                // Filtro de tipo de memoria
                if (req.query.tipo_de_memoria && req.query.tipo_de_memoria !== '') {
                    console.log(`Applying motherboard memory type filter: ${req.query.tipo_de_memoria}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Tipo de memoria': { $regex: req.query.tipo_de_memoria, $options: 'i' } },
                                { tipo_de_memoria: { $regex: req.query.tipo_de_memoria, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de ranuras de RAM
                if (req.query.ranuras_de_ram && Array.isArray(req.query.ranuras_de_ram) && req.query.ranuras_de_ram.length === 2) {
                    const minSlots = parseInt(req.query.ranuras_de_ram[0]);
                    const maxSlots = parseInt(req.query.ranuras_de_ram[1]);
                    console.log(`Applying motherboard RAM slots filter: ${minSlots} - ${maxSlots}`);
                    
                    // Add numeric range filter for RAM slots
                    pipeline.push(createNumericRangeStage([
                        'Características.Ranuras de RAM', 
                        'ranuras_de_ram'
                    ], minSlots, maxSlots));
                    useAggregation = true;
                }
                
                // Filtro de ranuras M.2
                if (req.query.ranuras_m2 && Array.isArray(req.query.ranuras_m2) && req.query.ranuras_m2.length === 2) {
                    const minSlots = parseInt(req.query.ranuras_m2[0]);
                    const maxSlots = parseInt(req.query.ranuras_m2[1]);
                    console.log(`Applying motherboard M.2 slots filter: ${minSlots} - ${maxSlots}`);
                    
                    // Add numeric range filter for M.2 slots
                    pipeline.push(createNumericRangeStage([
                        'Características.Ranuras M.2', 
                        'ranuras_m2'
                    ], minSlots, maxSlots));
                    useAggregation = true;
                }
                
                // Filtro de WiFi incluido
                if (req.query.redes_inalambricas !== undefined) {
                    const hasWifi = req.query.redes_inalambricas === 'true';
                    console.log(`Applying motherboard WiFi filter: ${hasWifi}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.WiFi': hasWifi ? 
                                  { $regex: /si|sí|yes|true|incluido|integrado|wifi/i } : 
                                  { $regex: /no|false/i } },
                                { redes_inalambricas: hasWifi }
                            ]
                        }
                    });
                    useAggregation = true;
                }
            }
            
            // Filtros para memoria RAM
            if (category === 'memory') {
                // Filtro de tipo de memoria
                if (req.query.tipo_de_memoria && req.query.tipo_de_memoria !== '') {
                    console.log(`Applying memory type filter: ${req.query.tipo_de_memoria}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Tipo': { $regex: req.query.tipo_de_memoria, $options: 'i' } },
                                { 'Características.Tipo de memoria': { $regex: req.query.tipo_de_memoria, $options: 'i' } },
                                { tipo_de_memoria: { $regex: req.query.tipo_de_memoria, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de velocidad
                if (req.query.velocidad && Array.isArray(req.query.velocidad) && req.query.velocidad.length === 2) {
                    const minSpeed = parseInt(req.query.velocidad[0]);
                    const maxSpeed = parseInt(req.query.velocidad[1]);
                    console.log(`Applying memory speed filter: ${minSpeed} - ${maxSpeed}`);
                    
                    // Add numeric range filter for memory speed
                    pipeline.push(createNumericRangeStage([
                        'Características.Velocidad', 
                        'velocidad'
                    ], minSpeed, maxSpeed));
                    useAggregation = true;
                }
                
                // Filtro de configuración
                if (req.query.configuracion && req.query.configuracion !== '') {
                    console.log(`Applying memory configuration filter: ${req.query.configuracion}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Configuración': { $regex: req.query.configuracion, $options: 'i' } },
                                { configuracion: { $regex: req.query.configuracion, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de refrigeración pasiva
                if (req.query.refrigeracion_pasiva !== undefined) {
                    const hasPassiveCooling = req.query.refrigeracion_pasiva === 'true';
                    console.log(`Applying memory passive cooling filter: ${hasPassiveCooling}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Refrigeración pasiva': hasPassiveCooling ? 
                                  { $regex: /si|sí|yes|true/i } : 
                                  { $regex: /no|false/i } },
                                { refrigeracion_pasiva: hasPassiveCooling }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de latencia CAS
                if (req.query.latencia_cas && Array.isArray(req.query.latencia_cas) && req.query.latencia_cas.length === 2) {
                    const minLatency = parseInt(req.query.latencia_cas[0]);
                    const maxLatency = parseInt(req.query.latencia_cas[1]);
                    console.log(`Applying memory CAS latency filter: ${minLatency} - ${maxLatency}`);
                    
                    // Add numeric range filter for CAS latency
                    pipeline.push(createNumericRangeStage([
                        'Características.Latencia CAS', 
                        'latencia_cas'
                    ], minLatency, maxLatency));
                    useAggregation = true;
                }
            }
            
            // Filtros para almacenamiento
            if (category === 'storage') {
                // Filtro de tipo de almacenamiento
                if (req.query.tipo_de_almacenamiento && req.query.tipo_de_almacenamiento !== '') {
                    console.log(`Applying storage type filter: ${req.query.tipo_de_almacenamiento}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Tipo': { $regex: req.query.tipo_de_almacenamiento, $options: 'i' } },
                                { 'Características.Tipo de almacenamiento': { $regex: req.query.tipo_de_almacenamiento, $options: 'i' } },
                                { tipo_de_almacenamiento: { $regex: req.query.tipo_de_almacenamiento, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de capacidad
                if (req.query.capacidad && req.query.capacidad !== '') {
                    console.log(`Applying storage capacity filter: ${req.query.capacidad}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Capacidad': { $regex: req.query.capacidad, $options: 'i' } },
                                { capacidad: { $regex: req.query.capacidad, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de interfaz
                if (req.query.interfaz && req.query.interfaz !== '') {
                    console.log(`Applying storage interface filter: ${req.query.interfaz}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Interfaz': { $regex: req.query.interfaz, $options: 'i' } },
                                { interfaz: { $regex: req.query.interfaz, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de factor de forma
                if (req.query.factor_de_forma && req.query.factor_de_forma !== '') {
                    console.log(`Applying storage form factor filter: ${req.query.factor_de_forma}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Factor de forma': { $regex: req.query.factor_de_forma, $options: 'i' } },
                                { factor_de_forma: { $regex: req.query.factor_de_forma, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de compatibilidad NVMe
                if (req.query.compatibilidad_con_nvme !== undefined) {
                    const isNvmeCompatible = req.query.compatibilidad_con_nvme === 'true';
                    console.log(`Applying storage NVMe compatibility filter: ${isNvmeCompatible}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Compatible con NVMe': isNvmeCompatible ? 
                                  { $regex: /si|sí|yes|true/i } : 
                                  { $regex: /no|false/i } },
                                { compatibilidad_con_nvme: isNvmeCompatible }
                            ]
                        }
                    });
                    useAggregation = true;
                }
            }
            
            // Filtros para fuente de alimentación
            if (category === 'power-supply') {
                // Filtro de potencia
                if (req.query.potencia && Array.isArray(req.query.potencia) && req.query.potencia.length === 2) {
                    const minWattage = parseInt(req.query.potencia[0]);
                    const maxWattage = parseInt(req.query.potencia[1]);
                    console.log(`Applying PSU wattage filter: ${minWattage} - ${maxWattage}`);
                    
                    // Add numeric range filter for PSU wattage
                    pipeline.push(createNumericRangeStage([
                        'Características.Potencia', 
                        'potencia'
                    ], minWattage, maxWattage));
                    useAggregation = true;
                }
                
                // Filtro de certificación
                if (req.query.calificacion_de_eficiencia && req.query.calificacion_de_eficiencia !== '') {
                    console.log(`Applying PSU certification filter: ${req.query.calificacion_de_eficiencia}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Certificación': { $regex: req.query.calificacion_de_eficiencia, $options: 'i' } },
                                { 'Características.Calificación de eficiencia': { $regex: req.query.calificacion_de_eficiencia, $options: 'i' } },
                                { calificacion_de_eficiencia: { $regex: req.query.calificacion_de_eficiencia, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de modularidad
                if (req.query.modular !== undefined) {
                    const isModular = req.query.modular === 'true';
                    console.log(`Applying PSU modularity filter: ${isModular}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Modular': isModular ? 
                                  { $regex: /si|sí|yes|true|completo|semi/i } : 
                                  { $regex: /no|false/i } },
                                { modular: isModular }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de factor de forma
                if (req.query.factor_de_forma && req.query.factor_de_forma !== '') {
                    console.log(`Applying PSU form factor filter: ${req.query.factor_de_forma}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Factor de forma': { $regex: req.query.factor_de_forma, $options: 'i' } },
                                { factor_de_forma: { $regex: req.query.factor_de_forma, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de longitud
                if (req.query.longitud && Array.isArray(req.query.longitud) && req.query.longitud.length === 2) {
                    const minLength = parseInt(req.query.longitud[0]);
                    const maxLength = parseInt(req.query.longitud[1]);
                    console.log(`Applying PSU length filter: ${minLength} - ${maxLength}`);
                    
                    // Add numeric range filter for PSU length
                    pipeline.push(createNumericRangeStage([
                        'Características.Longitud', 
                        'longitud'
                    ], minLength, maxLength));
                    useAggregation = true;
                }
            }
            
            // Filtros para gabinete
            if (category === 'case') {
                // Filtro de longitud máxima de GPU
                if (req.query.longitud_maxima_de_gpu && Array.isArray(req.query.longitud_maxima_de_gpu) && req.query.longitud_maxima_de_gpu.length === 2) {
                    const minLength = parseInt(req.query.longitud_maxima_de_gpu[0]);
                    const maxLength = parseInt(req.query.longitud_maxima_de_gpu[1]);
                    console.log(`Applying case max GPU length filter: ${minLength} - ${maxLength}`);
                    
                    // Add numeric range filter for max GPU length
                    pipeline.push(createNumericRangeStage([
                        'Características.Longitud máxima de GPU', 
                        'longitud_maxima_de_gpu'
                    ], minLength, maxLength));
                    useAggregation = true;
                }
                
                // Filtro de factor de forma
                if (req.query.factores_de_forma && req.query.factores_de_forma !== '') {
                    console.log(`Applying case form factor filter: ${req.query.factores_de_forma}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Factores de forma': { $regex: req.query.factores_de_forma, $options: 'i' } },
                                { factores_de_forma: { $regex: req.query.factores_de_forma, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de ranuras de expansión
                if (req.query.ranuras_de_expansion && req.query.ranuras_de_expansion !== '') {
                    console.log(`Applying case expansion slots filter: ${req.query.ranuras_de_expansion}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Ranuras de expansión de altura completa': { $regex: req.query.ranuras_de_expansion, $options: 'i' } },
                                { ranuras_de_expansion_de_altura: { $regex: req.query.ranuras_de_expansion, $options: 'i' } }
                            ]
                        }
                    });
                    useAggregation = true;
                }
            }
            
            // Filtros para refrigeración
            if (category === 'cooler') {
                // Filtro de refrigeración líquida
                if (req.query.refrigerado_por_agua !== undefined) {
                    const isLiquidCooled = req.query.refrigerado_por_agua === 'true';
                    console.log(`Applying cooler liquid cooling filter: ${isLiquidCooled}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Refrigerado por agua': isLiquidCooled ? 
                                  { $regex: /si|sí|yes|true/i } : 
                                  { $regex: /no|false/i } },
                                { refrigerado_por_agua: isLiquidCooled }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de enfriamiento pasivo
                if (req.query.sin_ventilador !== undefined) {
                    const isPassiveCooling = req.query.sin_ventilador === 'true';
                    console.log(`Applying cooler passive cooling filter: ${isPassiveCooling}`);
                    
                    pipeline.push({
                        $match: {
                            $or: [
                                { 'Características.Sin ventilador': isPassiveCooling ? 
                                  { $regex: /si|sí|yes|true/i } : 
                                  { $regex: /no|false/i } },
                                { sin_ventilador: isPassiveCooling }
                            ]
                        }
                    });
                    useAggregation = true;
                }
                
                // Filtro de ruido máximo
                if (req.query.ruido_maximo && Array.isArray(req.query.ruido_maximo) && req.query.ruido_maximo.length === 2) {
                    const minNoise = parseInt(req.query.ruido_maximo[0]);
                    const maxNoise = parseInt(req.query.ruido_maximo[1]);
                    console.log(`Applying cooler max noise filter: ${minNoise} - ${maxNoise}`);
                    
                    // Add numeric range filter for max noise
                    pipeline.push(createNumericRangeStage([
                        'Características.Ruido máximo', 
                        'ruido_maximo'
                    ], minNoise, maxNoise));
                    useAggregation = true;
                }
                
                // Filtro de RPM máximas
                if (req.query.rpm_maximas && Array.isArray(req.query.rpm_maximas) && req.query.rpm_maximas.length === 2) {
                    const minRPM = parseInt(req.query.rpm_maximas[0]);
                    const maxRPM = parseInt(req.query.rpm_maximas[1]);
                    console.log(`Applying cooler max RPM filter: ${minRPM} - ${maxRPM}`);
                    
                    // Add numeric range filter for max RPM
                    pipeline.push(createNumericRangeStage([
                        'Características.RPM máximas', 
                        'rpm_maximas'
                    ], minRPM, maxRPM));
                    useAggregation = true;
                }
                
                // Filtro de longitud del radiador
                if (req.query.longitud_del_radiador && Array.isArray(req.query.longitud_del_radiador) && req.query.longitud_del_radiador.length === 2) {
                    const minLength = parseInt(req.query.longitud_del_radiador[0]);
                    const maxLength = parseInt(req.query.longitud_del_radiador[1]);
                    console.log(`Applying cooler radiator length filter: ${minLength} - ${maxLength}`);
                    
                    // Add numeric range filter for radiator length
                    pipeline.push(createNumericRangeStage([
                        'Características.Longitud del radiador', 
                        'longitud_del_radiador'
                    ], minLength, maxLength));
                    useAggregation = true;
                }
            }
        }

        let items = [];
        
        if (useAggregation && pipeline.length > 0) {
            // Log final pipeline for debugging
            console.log('Final aggregation pipeline:', JSON.stringify(pipeline));
            
            // Execute aggregation pipeline
            items = await mongoose.connection.db
                .collection(collName)
                .aggregate(pipeline)
                .toArray();
            
            console.log(`Encontrados ${items.length} componentes en ${collName} usando el pipeline de agregación`);
            
            // Show sample result for debugging if no results found
            if (items.length === 0) {
                console.log('No se encontraron resultados con los filtros. Realizando un diagnóstico...');
                
                // Get a sample document to check data structure
                const sampleDocs = await mongoose.connection.db
                    .collection(collName)
                    .find({})
                    .limit(1)
                    .toArray();
                    
                if (sampleDocs.length > 0) {
                    console.log('Muestra de estructura de documento:', JSON.stringify(sampleDocs[0]));
                }
            }
            
        } else {
            // If no filters, just get all documents
            console.log(`Obteniendo todos los documentos de ${collName}`);
            items = await mongoose.connection.db
                .collection(collName)
                .find({})
                .toArray();
                
            console.log(`Encontrados ${items.length} componentes en ${collName}`);
        }
        
        res.json(items);
    } catch (err) {
        console.error('🔥 Error al consultar la colección', collName, err);
        res.status(500).json({ error: err.message });
    }
});

// Configurar el servidor en el puerto especificado
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API corriendo en http://localhost:${PORT}/api`);
});

