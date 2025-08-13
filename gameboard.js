/*========================================================================================
□■ gameboard.js ■□
========================================================================================*/

// Canvas globals
let gameboardCanvas = null;
let gameboardCtx = null;
let canvasBlockImages = {};
let canvasIsReady = false;
const BLOCK_SIZE = 512; // (px)
const CANVAS_WIDTH = BLOCK_SIZE * 10;  
const CANVAS_HEIGHT = BLOCK_SIZE * 20; 

// Image loading promises for proper initialization
const imagePromises = [];

/*----------------------------------------------------------------------------------------
☆★ Initialize Canvas Gameboard ★☆
----------------------------------------------------------------------------------------*/
function InitializeCanvas() {
    console.log("Initializing canvas gameboard...");
    console.log("Current document ready state:", document.readyState);
    
    // Function to actually initialize the canvas
    function doInitialization() {
        console.log("Attempting canvas initialization...");
        
        // Try to find the existing canvas first
        gameboardCanvas = document.getElementById('gameboard-canvas') || 
                         document.getElementById('game-canvas');
        console.log("Canvas element:", gameboardCanvas);
        
        if (!gameboardCanvas) {
            console.log("No existing canvas found, creating one...");
            
            const gbWrapper = document.getElementById('gb-wrapper');
            if (!gbWrapper) {
                console.error("gb-wrapper not found!");
                return false;
            }
            
            // Create or find the gb container
            let gbContainer = document.getElementById('gb');
            if (!gbContainer) {
                console.log("Creating gb container...");
                gbContainer = document.createElement('div');
                gbContainer.id = 'gb';
                gbWrapper.appendChild(gbContainer);
            }
            
            // Create the canvas
            gameboardCanvas = document.createElement('canvas');
            gameboardCanvas.id = 'gameboard-canvas';
            gameboardCanvas.width = CANVAS_WIDTH;
            gameboardCanvas.height = CANVAS_HEIGHT;
            
            // Remove any existing canvas with old ID
            const oldCanvas = document.getElementById('game-canvas');
            if (oldCanvas) {
                console.log("Removing old canvas...");
                oldCanvas.remove();
            }
            
            gbContainer.appendChild(gameboardCanvas);
            console.log("Canvas created and added to DOM");
        }
        
        gameboardCtx = gameboardCanvas.getContext('2d');
        console.log("Canvas context:", gameboardCtx);
        
        if (!gameboardCtx) {
            console.error("Could not get 2D context!");
            return false;
        }
        
        // Set canvas size (internal resolution)
        gameboardCanvas.width = CANVAS_WIDTH;
        gameboardCanvas.height = CANVAS_HEIGHT;
        
        // Set CSS size to match exactly (displayed size)
        gameboardCanvas.style.width = CANVAS_WIDTH + 'px';
        gameboardCanvas.style.height = CANVAS_HEIGHT + 'px';
        gameboardCanvas.style.display = 'block';
        gameboardCanvas.style.margin = '0';
        gameboardCanvas.style.padding = '0';
        gameboardCanvas.style.border = 'none';
        gameboardCanvas.style.outline = 'none';
        
        console.log(`Canvas dimensions set to ${CANVAS_WIDTH}x${CANVAS_HEIGHT}`);
        
        // Disable image smoothing for pixel-perfect rendering
        gameboardCtx.imageSmoothingEnabled = false;
        if (gameboardCtx.mozImageSmoothingEnabled !== undefined) {
            gameboardCtx.mozImageSmoothingEnabled = false;
        }
        if (gameboardCtx.webkitImageSmoothingEnabled !== undefined) {
            gameboardCtx.webkitImageSmoothingEnabled = false;
        }
        if (gameboardCtx.msImageSmoothingEnabled !== undefined) {
            gameboardCtx.msImageSmoothingEnabled = false;
        }
        
        // Clear with a test color first
        ClearCanvas();
        
        console.log("Canvas initialized, loading images...");
        LoadCanvasImages();
        
        return true;
    }
    
    // Try immediate initialization
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        return doInitialization();
    }
    
    // If document not ready, wait for DOM content to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', doInitialization);
        return true;
    }
    
    // Fallback with timeout
    setTimeout(doInitialization, 500);
    return true;
}

/*----------------------------------------------------------------------------------------
☆★ Manual Initialization for Debugging ★☆
----------------------------------------------------------------------------------------*/
function ManualInitializeCanvas() {
    console.log("=== MANUAL CANVAS INITIALIZATION ===");
    console.log("Document ready state:", document.readyState);
    console.log("All canvas elements:", document.querySelectorAll('canvas'));
    console.log("Element by ID:", document.getElementById('gameboard-canvas'));
    console.log("All elements with 'gb' in ID:", Array.from(document.querySelectorAll('[id*="gb"]')));
    
    // Force initialization
    const result = InitializeCanvas();
    console.log("Initialization result:", result);
    
    return result;
}

// Make functions available globally for console testing
window.TestCanvasRendering = TestCanvasRendering;
window.InitializeCanvas = InitializeCanvas;
window.ManualInitializeCanvas = ManualInitializeCanvas;
window.ClearCanvas = ClearCanvas;

/*----------------------------------------------------------------------------------------
☆★ Load All Block Images ★☆
----------------------------------------------------------------------------------------*/
function LoadCanvasImages() {
    console.log("Loading canvas block images...");
    
    const blockIds = [
        0, 1, 2, 3, 11, 12, 13, 14, 15, 16, 17, 31,
        41, 42, 43, 44, 45, 46, 47, 51, 52, 53, 54, 55, 56, 57
    ];
    
    let loadedCount = 0;
    const totalImages = blockIds.length;
    
    const imagePromises = blockIds.map(id => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            // force rasterization by setting explicit dimensions
            img.width = BLOCK_SIZE;
            img.height = BLOCK_SIZE;
            
            img.onload = () => {
                // pre-render svg to canvas 
                const canvas = document.createElement('canvas');
                canvas.width = BLOCK_SIZE;
                canvas.height = BLOCK_SIZE;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, BLOCK_SIZE, BLOCK_SIZE);
                
                canvasBlockImages[id] = canvas; // store canvas instead of image
                loadedCount++;
                console.log(`Loaded and rasterized image ${id} (${loadedCount}/${totalImages})`);
                resolve();
            };
            
            img.onerror = reject;
            img.src = `img/b${id}.svg`;
        });
    });
    
    Promise.all(imagePromises).then(() => {
        canvasIsReady = true;
        console.log("All canvas images loaded and optimized!");
        ClearCanvas();
    }).catch(error => {
        console.error("Error loading images:", error);
        canvasIsReady = true; 
        ClearCanvas();
    });
}

/*----------------------------------------------------------------------------------------
☆★ Clear Canvas ★☆
----------------------------------------------------------------------------------------*/
function ClearCanvas() {
    if (!gameboardCtx) {
        console.error("Canvas context not available for clearing");
        return;
    }
    
    console.log("Clearing canvas...");
    
    // First, clear the entire canvas with a background color similar to empty blocks
    gameboardCtx.fillStyle = '#1a1a1a'; // Dark background similar to b0.svg
    gameboardCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    if (!canvasIsReady) {
        console.log("Canvas images not ready, showing placeholder grid");
        // Draw a simple grid pattern as fallback
        gameboardCtx.strokeStyle = '#333';
        gameboardCtx.lineWidth = 1;
        for (let row = 0; row <= 20; row++) {
            gameboardCtx.beginPath();
            gameboardCtx.moveTo(0, row * BLOCK_SIZE);
            gameboardCtx.lineTo(CANVAS_WIDTH, row * BLOCK_SIZE);
            gameboardCtx.stroke();
        }
        for (let col = 0; col <= 10; col++) {
            gameboardCtx.beginPath();
            gameboardCtx.moveTo(col * BLOCK_SIZE, 0);
            gameboardCtx.lineTo(col * BLOCK_SIZE, CANVAS_HEIGHT);
            gameboardCtx.stroke();
        }
        return;
    }
    
    // Fill with empty blocks (b0.svg)
    const emptyBlockImg = canvasBlockImages[0];
    if (!emptyBlockImg) {
        console.error("Empty block image not loaded");
        return;
    }
    
    console.log("Drawing empty blocks...");
    for (let row = 0; row < 20; row++) {
        for (let col = 0; col < 10; col++) {
            gameboardCtx.drawImage(
                emptyBlockImg,
                col * BLOCK_SIZE,
                row * BLOCK_SIZE,
                BLOCK_SIZE,
                BLOCK_SIZE
            );
        }
    }
    
    console.log("Canvas cleared and filled with empty blocks");
}

/*----------------------------------------------------------------------------------------
☆★ Draw Block at Canvas Position ★☆
----------------------------------------------------------------------------------------*/
function DrawCanvasBlock(col, row, blockId) {
    if (!gameboardCtx || !canvasIsReady) return;
    
    const blockCanvas = canvasBlockImages[blockId];
    if (!blockCanvas) {
        console.warn(`Block image ${blockId} not loaded`);
        return;
    }
    
    // Draw pre-rasterized canvas (much faster than SVG)
    gameboardCtx.drawImage(
        blockCanvas,
        col * BLOCK_SIZE,
        row * BLOCK_SIZE
    );
}

/*----------------------------------------------------------------------------------------
☆★ Canvas-Compatible SetImage Function ★☆
----------------------------------------------------------------------------------------*/
function SetImageCanvas(imageId, src) {
    if (!canvasIsReady) return;
    
    // Parse the imageId to get row and column (format: "m{row}_{col}")
    const match = imageId.match(/^m(\d+)_(\d+)$/);
    if (!match) return;
    
    const row = parseInt(match[1], 10);
    const col = parseInt(match[2], 10);
    
    // Extract block ID from source path
    const srcMatch = src.match(/b(\d+)\.svg$/);
    if (!srcMatch) return;
    
    const blockId = parseInt(srcMatch[1], 10);
    
    // Draw the block
    DrawCanvasBlock(col, row, blockId);
}

/*----------------------------------------------------------------------------------------
☆★ Check if Canvas is Ready ★☆
----------------------------------------------------------------------------------------*/
function IsCanvasReady() {
    return canvasIsReady;
}

/*----------------------------------------------------------------------------------------
☆★ Get Canvas Dimensions ★☆
----------------------------------------------------------------------------------------*/
function GetCanvasDimensions() {
    return {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        blockSize: BLOCK_SIZE,
        cols: 10,
        rows: 20
    };
}

/*----------------------------------------------------------------------------------------
☆★ Debug Function - Test Canvas Rendering ★☆
----------------------------------------------------------------------------------------*/
function TestCanvasRendering() {
    console.log("Testing canvas rendering...");
    if (!canvasIsReady) {
        console.log("Canvas not ready yet");
        return;
    }
    
    // Draw some test blocks
    DrawCanvasBlock(0, 0, 11); // Red I
    DrawCanvasBlock(1, 0, 12); // Yellow T
    DrawCanvasBlock(2, 0, 13); // Blue J
    DrawCanvasBlock(0, 1, 14); // Orange L
    DrawCanvasBlock(1, 1, 15); // Green Z
    DrawCanvasBlock(2, 1, 16); // Purple S
    DrawCanvasBlock(0, 2, 17); // Cyan O
    
    console.log("Test blocks rendered");
}

// Make test function available globally for console testing
window.TestCanvasRendering = TestCanvasRendering;
window.InitializeCanvas = InitializeCanvas;
window.ClearCanvas = ClearCanvas;
