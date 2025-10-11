// Firebase imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    query, 
    where, 
    getDocs, 
    doc, 
    updateDoc, 
    orderBy, 
    onSnapshot,
    Timestamp 
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';

// Initialize Firebase
const app = initializeApp(window.firebaseConfig);
const db = getFirestore(app);

// Global state
let appState = {
    devices: {
        handover: [],
        payment: [],
        returns: []
    },
    revenue: 0,
    currentTab: 'handover'
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeSmartApp();
    setupEventListeners();
    startRealtimeUpdates();
});
let currentProcessingDevice = null;
window.currentProcessingDevice = currentProcessingDevice;
// Initialize application
async function initializeSmartApp() {
    console.log('🚀 Initializing Smart Onboarding Panel...');
    
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    await loadAllDevices();
    await loadTodayRevenue();
    
    showNotification('Smart Onboarding Panel Ready! 🎉', 'success');
}
async function initiateHandover(deviceId) {
    try {
        const device = findDeviceById(deviceId);
        if (!device) {
            showNotification('Device not found', 'error');
            return;
        }
        
        currentProcessingDevice = device;
        
        // Populate modal with device details
        document.getElementById('handoverDeviceDetails').innerHTML = `
            <div class="device-summary">
                <strong>Ticket ID:</strong> ${device.ticketId}<br>
                <strong>Customer:</strong> ${device.customerName}<br>
                <strong>Device:</strong> ${device.deviceBrand} ${device.deviceModel}<br>
                <strong>Amount:</strong> ₹${device.estimatedCost}
            </div>
        `;
        
        showModal('handoverModal');
    } catch (error) {
        console.error('Error initiating handover:', error);
        showNotification('Failed to initiate handover', 'error');
    }
}
// Setup all event listeners
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Quick actions
    document.getElementById('newRegistrationBtn').addEventListener('click', openRegistrationModal);
    document.getElementById('searchDeviceBtn').addEventListener('click', focusSearchInput);
    document.getElementById('performSearch').addEventListener('click', performSearch);
    document.getElementById('refreshData').addEventListener('click', refreshAllData);
    // Add to setupEventListeners function
document.getElementById('confirmHandover').addEventListener('click', confirmHandover);
document.getElementById('confirmPayment').addEventListener('click', function(e) {
    e.preventDefault();
    handlePaymentConfirmation();
});
document.getElementById('confirmReturn').addEventListener('click', confirmDeviceReturn);

    // Search functionality
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // Registration form
    document.getElementById('submitRegistration').addEventListener('click', submitDeviceRegistration);

    // Close notification
    document.getElementById('closeNotification').addEventListener('click', hideNotification);

    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
}

// Load all devices and categorize
async function loadAllDevices() {
    try {
        console.log('🔥 Loading devices from database...');
        
        const devicesQuery = query(
            collection(db, 'repair_tickets'),
            orderBy('updatedAt', 'desc')
        );
        
        const snapshot = await getDocs(devicesQuery);
        
        // Reset state
        appState.devices = {
            handover: [],
            payment: [],
            returns: []
        };
        
        let totalDevices = 0;
        
        snapshot.forEach(doc => {
            const device = { id: doc.id, ...doc.data() };
            totalDevices++;
            
            const status = device.status?.toLowerCase() || '';
            const repairType = device.repairType?.toLowerCase() || '';
            
            console.log(`Processing device ${device.ticketId}: status="${status}", repairType="${repairType}"`);
            
            // Skip devices that have been ACTUALLY returned to customer (processed)
            // Check for handover completion flags, not just return status
            if (device.handoverDate && status.includes('handed over')) {
                console.log(`Skipping handed over device: ${device.ticketId}`);
                return;
            }
            
            if (device.paymentCollectedDate && status.includes('payment collected')) {
                console.log(`Skipping payment collected device: ${device.ticketId}`);
                return;
            }
            
            // NEW: Skip only if device was actually picked up by customer
            if (device.customerPickupDate || 
                (device.returnDate && device.handoverCompleted) ||
                status === 'customer picked up' ||
                status === 'handover completed') {
                console.log(`Skipping customer picked up device: ${device.ticketId}`);
                return;
            }
            
            // Categorize devices - Check returns FIRST
            if (isDeviceForReturn(device)) {
                appState.devices.returns.push(device);
                console.log(`Added to returns: ${device.ticketId}`);
            } else if (isDeviceReadyForHandover(device)) {
                appState.devices.handover.push(device);
                console.log(`Added to handover: ${device.ticketId}`);
            } else if (isDeviceAwaitingPayment(device)) {
                appState.devices.payment.push(device);
                console.log(`Added to payment: ${device.ticketId}`);
            }
        });
        
        console.log(`📊 Processed ${totalDevices} devices:`, {
            handover: appState.devices.handover.length,
            payment: appState.devices.payment.length,
            returns: appState.devices.returns.length,
            total: totalDevices
        });
        
        updateUI();
        
    } catch (error) {
        console.error('❌ Error loading devices:', error);
        showNotification('Failed to load devices', 'error');
    }
}

// Debug function to check return processing
async function debugReturnProcess(deviceId) {
    try {
        const deviceRef = doc(db, 'repair_tickets', deviceId);
        const deviceSnap = await getDoc(deviceRef);
        
        if (deviceSnap.exists()) {
            const device = deviceSnap.data();
            console.log('Device before return:', {
                ticketId: device.ticketId,
                status: device.status,
                returnDate: device.returnDate,
                updatedAt: device.updatedAt
            });
        }
    } catch (error) {
        console.error('Debug error:', error);
    }
}

// Call this before and after return processing
window.debugReturnProcess = debugReturnProcess;


// Device categorization helpers
function isDeviceReadyForHandover(device) {
    const status = device.status?.toLowerCase() || '';
    const paymentStatus = device.paymentStatus?.toLowerCase() || '';
    
    // Skip if already processed
    if (status.includes('handed over') || status.includes('payment collected') || device.handoverDate) {
        return false;
    }
    
    return (status.includes('completed') || status.includes('ready')) &&
           (paymentStatus === 'paid_online' || paymentStatus === 'online_paid');
}

function isDeviceAwaitingPayment(device) {
    const status = device.status?.toLowerCase() || '';
    const paymentStatus = device.paymentStatus?.toLowerCase() || '';
    
    // Skip if already processed
    if (status.includes('payment collected') || status.includes('handed over') || device.paymentCollectedDate) {
        return false;
    }
    
    return (status.includes('completed') || status.includes('ready')) &&
           paymentStatus !== 'paid_online' &&
           paymentStatus !== 'online_paid';
}

// Enhanced function to check if device is for return
function isDeviceForReturn(device) {
    const status = device.status?.toLowerCase() || '';
    const repairType = device.repairType?.toLowerCase() || '';
    
    console.log(`Checking return status for ${device.ticketId}: 
        status="${status}", 
        repairType="${repairType}",
        returnReason="${device.returnReason || 'none'}"`);
    
    // Device is for return if:
    // 1. Marked as returned to customer BUT not yet picked up
    // 2. Has return reason indicating unrepairable
    // 3. Status indicates cannot repair
    
    const isUnrepairable = status.includes('cannot') ||
                          status.includes('unrepairable') ||
                          status.includes('not repairable') ||
                          status.includes('unable to repair') ||
                          repairType === 'unrepairable' ||
                          device.unrepairable === true ||
                          device.isUnrepairable === true;
    
    const isReturnedButNotPickedUp = status === 'returned to customer' && 
                                    !device.customerPickupDate && 
                                    !device.handoverCompleted;
    
    const hasReturnReason = device.returnReason && 
                           device.returnReason !== '' && 
                           device.returnDate;
    
    return isUnrepairable || isReturnedButNotPickedUp || hasReturnReason;
}
function isDeviceProcessed(device) {
    const status = device.status?.toLowerCase() || '';
    return status === 'handed over to customer' ||
           status === 'payment collected' ||
           status === 'returned to customer' ||
           device.handoverDate ||
           device.paymentCollectedDate ||
           device.returnDate;
}

// Update UI elements
function updateUI() {
    updateStatistics();
    updateTabContent();
    updateTabBadges();
}

// Update header statistics
function updateStatistics() {
    document.getElementById('onlinePayments').textContent = appState.devices.handover.length;
    document.getElementById('readyDevices').textContent = 
        appState.devices.handover.length + appState.devices.payment.length;
    document.getElementById('todayRevenue').textContent = `₹${appState.revenue.toLocaleString('en-IN')}`;
}

// Update tab badges
function updateTabBadges() {
    document.getElementById('handoverBadge').textContent = appState.devices.handover.length;
    document.getElementById('paymentBadge').textContent = appState.devices.payment.length;
    document.getElementById('returnsBadge').textContent = appState.devices.returns.length;
}

// Update tab content
function updateTabContent() {
    updateHandoverDevices();
    updatePaymentDevices();
    updateReturnsDevices();
}

// Update handover devices tab
function updateHandoverDevices() {
    const container = document.getElementById('handoverDevices');
    
    if (appState.devices.handover.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-handshake"></i>
                <h3>No Devices Ready for Handover</h3>
                <p>Devices with confirmed online payments will appear here</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = appState.devices.handover
        .map(device => createHandoverCard(device))
        .join('');
}

function createHandoverCard(device) {
    // Prioritize finalPaymentAmount, then finalAmount, then estimatedCost
    const amount = device.finalPaymentAmount 
        ? parseFloat(device.finalPaymentAmount)
        : device.finalAmount
        ? parseFloat(device.finalAmount)
        : parseFloat(device.estimatedCost || 0);

    const completedDate = device.completedAt 
        ? device.completedAt.toDate().toLocaleDateString('en-IN') 
        : 'Recently';
    
    return `
        <div class="device-card online-paid">
            <div class="device-header">
                <div class="device-id">${device.ticketId}</div>
                <div class="device-status online">
                    <i class="fas fa-check-circle"></i>
                    PAID ONLINE
                </div>
            </div>
            
            <div class="device-info">
                <div class="info-row">
                    <span class="info-label">Customer</span>
                    <span class="info-value">${device.customerName}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Mobile</span>
                    <span class="info-value">${device.customerMobile}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Device</span>
                    <span class="info-value">${device.deviceBrand} ${device.deviceModel}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Amount Due</span>
                    <span class="info-value">₹${amount.toLocaleString('en-IN')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Completed</span>
                    <span class="info-value">${completedDate}</span>
                </div>
            </div>
            
            <div class="device-actions">
                <button class="device-btn handover" onclick="initiateHandover('${device.id}')">
                    <i class="fas fa-handshake"></i>
                    Smart Handover
                </button>
            </div>
        </div>
    `;
}
// Update payment devices tab
function updatePaymentDevices() {
    const container = document.getElementById('paymentDevices');
    
    if (appState.devices.payment.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-credit-card"></i>
                <h3>No Payment Pending Devices</h3>
                <p>Completed devices awaiting payment will appear here</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = appState.devices.payment
        .map(device => createPaymentCard(device))
        .join('');
}

// Create payment device card
function createPaymentCard(device) {
    const estimatedCost = device.estimatedCost || 0;
    const completedDate = device.completedAt ? 
        device.completedAt.toDate().toLocaleDateString('en-IN') : 'Recently';
    
    return `
        <div class="device-card payment-pending">
            <div class="device-header">
                <div class="device-id">${device.ticketId}</div>
                <div class="device-status pending">
                    <i class="fas fa-clock"></i>
                    PAYMENT PENDING
                </div>
            </div>
            
            <div class="device-info">
                <div class="info-row">
                    <span class="info-label">Customer</span>
                    <span class="info-value">${device.customerName}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Mobile</span>
                    <span class="info-value">${device.customerMobile}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Device</span>
                    <span class="info-value">${device.deviceBrand} ${device.deviceModel}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Amount Due</span>
                    <span class="info-value">₹${estimatedCost.toLocaleString('en-IN')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Completed</span>
                    <span class="info-value">${completedDate}</span>
                </div>
            </div>
            
           
<div class="device-actions">
    <button class="device-btn whatsapp" onclick="openWhatsAppModal('${device.id}', 'payment')">
        <i class="fab fa-whatsapp"></i>
        Notify Customer
    </button>
    <button class="device-btn payment" onclick="collectPayment('${device.id}')">
        <i class="fas fa-rupee-sign"></i>
        Collect Payment
    </button>
</div>
        </div>
    `;
}

// Update returns devices tab
function updateReturnsDevices() {
    const container = document.getElementById('returnsDevices');
    
    if (appState.devices.returns.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-undo"></i>
                <h3>No Devices for Return</h3>
                <p>Unrepairable devices will appear here</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = appState.devices.returns
        .map(device => createReturnCard(device))
        .join('');
}

// Create return device card
function createReturnCard(device) {
    const updatedDate = device.updatedAt ? 
        device.updatedAt.toDate().toLocaleDateString('en-IN') : 'Recently';
    
    // Show return reason if available
    const returnReason = device.returnReason || 'Device cannot be repaired';
    const returnDetails = device.returnDetails ? ` - ${device.returnDetails}` : '';
    
    return `
        <div class="device-card return-device">
            <div class="device-header">
                <div class="device-id">${device.ticketId}</div>
                <div class="device-status return">
                    <i class="fas fa-exclamation-triangle"></i>
                    FOR RETURN
                </div>
            </div>
            
            <div class="device-info">
                <div class="info-row">
                    <span class="info-label">Customer</span>
                    <span class="info-value">${device.customerName}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Mobile</span>
                    <span class="info-value">${device.customerMobile}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Device</span>
                    <span class="info-value">${device.deviceBrand} ${device.deviceModel}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Issue</span>
                    <span class="info-value">${device.deviceProblem}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Return Reason</span>
                    <span class="info-value" style="color: #e53e3e; font-weight: 500;">
                        ${returnReason}${returnDetails}
                    </span>
                </div>
                <div class="info-row">
                    <span class="info-label">Updated</span>
                    <span class="info-value">${updatedDate}</span>
                </div>
            </div>
            
           
<div class="device-actions">
    <button class="device-btn whatsapp" onclick="openWhatsAppModal('${device.id}', 'return')">
        <i class="fab fa-whatsapp"></i>
        Notify Customer
    </button>
    <button class="device-btn return" onclick="processReturn('${device.id}')">
        <i class="fas fa-hand-holding"></i>
        Hand Over to Customer
    </button>
</div>
        </div>
    `;
}

// Tab switching
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        if (content.id === `${tabName}Content`) {
            content.classList.add('active');
        }
    });
    
    appState.currentTab = tabName;
}



// whatsapp sending code --------------------------

// Open WhatsApp modal with pre-filled message

// Global variables for WhatsApp
let currentWhatsAppDevice = null;
let currentWhatsAppType = null;
let selectedLanguage = 'english';

// WhatsApp message templates
const whatsappTemplates = {
    payment: {
        english: (device) => `Hello ${device.customerName}! 👋

Good news! Your *${device.deviceBrand} ${device.deviceModel}* has been successfully repaired and is ready for pickup! ✅

📋 *Ticket ID:* ${device.ticketId}
📍 *Location:* PhoneCare, Shop No 27, Mahanadi Complex, Niharika, Korba

Please visit us at your convenience to collect your device and complete the payment.

🕒 *Working Hours:* 10 AM - 10 PM (All Days)

For any queries, call: +91 93407 57231

Thank you for choosing PhoneCare! 😊`,

        hindi: (device) => `नमस्ते ${device.customerName}! 👋

खुशखबरी! आपका *${device.deviceBrand} ${device.deviceModel}* सफलतापूर्वक रिपेयर हो गया है और लेने के लिए तैयार है! ✅

📋 *टिकट आईडी:* ${device.ticketId}
📍 *पता:* फोनकेयर, शॉप नं 27, महानदी कॉम्प्लेक्स, निहारिका, कोरबा

कृपया अपनी सुविधानुसार हमारे पास आएं और अपना डिवाइस लेकर भुगतान पूरा करें।

🕒 *समय:* सुबह 10 बजे - रात 10 बजे (सभी दिन)

किसी भी प्रश्न के लिए कॉल करें: +91 93407 57231

फोनकेयर चुनने के लिए धन्यवाद! 😊`
    },

    return: {
        english: (device) => `Hello ${device.customerName}! 👋

Regarding your *${device.deviceBrand} ${device.deviceModel}*

📋 *Ticket ID:* ${device.ticketId}

After thorough inspection, we regret to inform you that your device cannot be repaired due to:
${device.returnReason || 'technical limitations'}

Your device is ready for return. Please collect it at your earliest convenience.

📍 *Location:* PhoneCare, Shop No 27, Mahanadi Complex, Niharika, Korba
🕒 *Working Hours:* 10 AM - 10 PM (All Days)

*No charges* will be applied. 

For any queries, call: +91 93407 57231

We apologize for the inconvenience.`,

        hindi: (device) => `नमस्ते ${device.customerName}! 👋

आपके *${device.deviceBrand} ${device.deviceModel}* के बारे में

📋 *टिकट आईडी:* ${device.ticketId}

पूरी जांच के बाद, हमें यह बताते हुए खेद है कि आपका डिवाइस रिपेयर नहीं हो सकता:
${device.returnReason || 'तकनीकी सीमाओं के कारण'}

आपका डिवाइस वापसी के लिए तैयार है। कृपया जल्द से जल्द इसे ले जाएं।

📍 *पता:* फोनकेयर, शॉप नं 27, महानदी कॉम्प्लेक्स, निहारिका, कोरबा
🕒 *समय:* सुबह 10 बजे - रात 10 बजे (सभी दिन)

*कोई शुल्क नहीं* लगेगा।

किसी भी प्रश्न के लिए कॉल करें: +91 93407 57231

असुविधा के लिए खेद है।`
    }
};

// Open WhatsApp modal
function openWhatsAppModal(deviceId, type) {
    const device = findDeviceById(deviceId);
    if (!device) {
        showNotification('Device not found', 'error');
        return;
    }

    currentWhatsAppDevice = device;
    currentWhatsAppType = type;
    selectedLanguage = 'english';

    // Reset language buttons
    document.querySelectorAll('.language-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector('.language-btn[data-lang="english"]').classList.add('active');

    // Display device info
    document.getElementById('whatsappDeviceInfo').innerHTML = `
        <div class="device-summary">
            <strong>Customer:</strong> ${device.customerName}<br>
            <strong>Mobile:</strong> ${device.customerMobile}<br>
            <strong>Device:</strong> ${device.deviceBrand} ${device.deviceModel}<br>
            <strong>Ticket ID:</strong> ${device.ticketId}
        </div>
    `;

    // Show preview
    updateMessagePreview();

    showModal('whatsappModal');
}

// Select language
function selectLanguage(lang) {
    selectedLanguage = lang;
    
    // Update button states
    document.querySelectorAll('.language-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.language-btn[data-lang="${lang}"]`).classList.add('active');
    
    // Update preview
    updateMessagePreview();
}

// Update message preview
function updateMessagePreview() {
    if (!currentWhatsAppDevice || !currentWhatsAppType) return;
    
    const message = whatsappTemplates[currentWhatsAppType][selectedLanguage](currentWhatsAppDevice);
    document.getElementById('messagePreview').textContent = message;
}
function isTodayOct12_2025() {
    const now = new Date();
    return now.getFullYear() === 2025 && (now.getMonth() + 1) === 10 && now.getDate() === 12;
}
function showWhatsAppIntroModal() {
    if (isTodayOct12_2025()) {
        const modal = document.getElementById('whatsappIntroModal');
        if (modal) {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    }
}
function closeIntroModal() {
    const modal = document.getElementById('whatsappIntroModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}
window.closeIntroModal = closeIntroModal; // Make it accessible from HTML

document.addEventListener('DOMContentLoaded', showWhatsAppIntroModal);
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.modal-close, .whatsapp-intro-modal .btn.primary').forEach(btn => {
        btn.addEventListener('click', closeIntroModal);
    });
});


// Send WhatsApp message using free WhatsApp Web API
// THIS IS THE MOST RELIABLE METHOD
function sendWhatsAppMessage() {
    if (!currentWhatsAppDevice) {
        showNotification('No device selected', 'error');
        return;
    }

    // Get phone number (remove any spaces, hyphens, etc.)
    let phoneNumber = currentWhatsAppDevice.customerMobile.replace(/\D/g, '');
    
    // Add country code if not present (assuming India +91)
    if (!phoneNumber.startsWith('91') && phoneNumber.length === 10) {
        phoneNumber = '91' + phoneNumber;
    }

    // Get message text
    const message = whatsappTemplates[currentWhatsAppType][selectedLanguage](currentWhatsAppDevice);
    
    // Encode message for URL - Use proper encoding
    const encodedMessage = encodeURIComponent(message);
    
    // Try different WhatsApp URL formats for better compatibility
    // Format 1: api.whatsapp.com (better for desktop)
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phoneNumber}&text=${encodedMessage}`;
    
    // Alternative Format 2: wa.me (better for mobile)
    // const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
    
    // Open WhatsApp in new window with proper attributes
    const newWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    
    if (newWindow) {
        // Log the notification
        logWhatsAppNotification(currentWhatsAppDevice.id, currentWhatsAppType, selectedLanguage);
        
        // Close modal
        closeModal('whatsappModal');
        
        showNotification(`WhatsApp opened! Message ready to send to ${currentWhatsAppDevice.customerName}`, 'success');
    } else {
        // If popup blocked, provide fallback
        showNotification('Please allow popups and try again', 'warning');
        
        // Copy message to clipboard as fallback
        copyMessageToClipboard(message, phoneNumber);
    }
}
function copyMessageToClipboard(message, phoneNumber) {
    // Create a temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = message;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        
        // Show manual instructions
        showNotification(`Message copied! Open WhatsApp manually for +${phoneNumber}`, 'info');
        
        // Open WhatsApp without message as last resort
        setTimeout(() => {
            window.open(`https://wa.me/${phoneNumber}`, '_blank');
        }, 1000);
    } catch (err) {
        console.error('Failed to copy message:', err);
        document.body.removeChild(textarea);
    }
}

// Copy message only (without opening WhatsApp)
function copyMessageOnly() {
    if (!currentWhatsAppDevice || !currentWhatsAppType) return;
    
    const message = whatsappTemplates[currentWhatsAppType][selectedLanguage](currentWhatsAppDevice);
    
    // Modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(message).then(() => {
            showNotification('Message copied to clipboard! 📋', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            fallbackCopy(message);
        });
    } else {
        fallbackCopy(message);
    }
}

// Fallback copy method
function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
        document.execCommand('copy');
        showNotification('Message copied to clipboard! 📋', 'success');
    } catch (err) {
        showNotification('Failed to copy message', 'error');
    }
    
    document.body.removeChild(textarea);
}

// Make function globally available
window.copyMessageOnly = copyMessageOnly;
// Log WhatsApp notifications to Firebase (optional)
async function logWhatsAppNotification(deviceId, type, language) {
    try {
        await addDoc(collection(db, 'whatsapp_logs'), {
            deviceId: deviceId,
            ticketId: currentWhatsAppDevice.ticketId,
            customerName: currentWhatsAppDevice.customerName,
            customerMobile: currentWhatsAppDevice.customerMobile,
            messageType: type,
            language: language,
            timestamp: Timestamp.now(),
            sentBy: 'Front Desk'
        });
        console.log('WhatsApp notification logged');
    } catch (error) {
        console.error('Error logging WhatsApp notification:', error);
    }
}

// Make functions globally available
window.openWhatsAppModal = openWhatsAppModal;
window.selectLanguage = selectLanguage;
window.sendWhatsAppMessage = sendWhatsAppMessage;



// Device actions
async function confirmHandover() {
    if (!currentProcessingDevice) return;
    
    try {
        const deviceRef = doc(db, 'repair_tickets', currentProcessingDevice.id);
        await updateDoc(deviceRef, {
            status: 'Handed Over to Customer',
            handoverDate: Timestamp.now(),
            updatedAt: Timestamp.now()
        });
        
        closeModal('handoverModal');
        showNotification(`Device ${currentProcessingDevice.ticketId} handed over successfully! 🎉`, 'success');
        currentProcessingDevice = null;
        
        // This will hide the card
        await loadAllDevices();
    } catch (error) {
        console.error('Error confirming handover:', error);
        showNotification('Failed to confirm handover', 'error');
    }
}

async function completeHandover(deviceId) {
    try {
        await updateDoc(doc(db, 'repair_tickets', deviceId), {
            status: 'Handover Completed',
            handoverDate: Timestamp.now(),
            handoverMethod: 'smart_online_payment',
            updatedAt: Timestamp.now()
        });

        closeModal('handoverModal');
        showNotification('Smart handover completed successfully! 🎉', 'success');
        await loadAllDevices();

    } catch (error) {
        console.error('Error completing handover:', error);
        showNotification('Failed to complete handover', 'error');
    }
}
// Confirm payment collection with final amount
// Confirm payment collection with final amount and method
async function confirmPaymentCollection() {
    if (!currentProcessingDevice) return;
    
    const finalAmount = document.getElementById('finalAmount').value;
    const paymentMethod = document.getElementById('paymentMethod').value;
    
    // Validate amount
    if (!finalAmount || parseFloat(finalAmount) <= 0) {
        showNotification('Please enter a valid payment amount', 'error');
        document.getElementById('finalAmount').focus();
        return;
    }
    
    // Validate payment method
    if (!paymentMethod) {
        showNotification('Please select a payment method', 'error');
        document.getElementById('paymentMethod').focus();
        return;
    }
    
    try {
        const deviceRef = doc(db, 'repair_tickets', currentProcessingDevice.id);
        const paymentData = {
            status: 'Payment Collected',
            paymentStatus: 'collected',
            finalAmount: parseFloat(finalAmount),
            finalPaymentAmount: parseFloat(finalAmount), // For reports compatibility
            paymentMethod: paymentMethod,
            paymentCollectedDate: Timestamp.now(),
            updatedAt: Timestamp.now()
        };
        
        await updateDoc(deviceRef, paymentData);
        
        // Also create a payment log entry for detailed reporting
        try {
            await addDoc(collection(db, 'payment_logs'), {
                ticketId: currentProcessingDevice.ticketId,
                customerName: currentProcessingDevice.customerName,
                deviceInfo: `${currentProcessingDevice.deviceBrand} ${currentProcessingDevice.deviceModel}`,
                amount: parseFloat(finalAmount),
                method: paymentMethod,
                timestamp: Timestamp.now(),
                type: 'payment_collection',
                deviceId: currentProcessingDevice.id
            });
        } catch (logError) {
            console.log('Payment recorded but failed to create log entry:', logError);
        }
        
        closeModal('paymentModal');
        
        // Get payment method display name for notification
        const methodNames = {
            'cash': 'Cash',
            'online': 'Online/UPI',
            'card': 'Card/POS'
        };
        
        showNotification(
            `Payment of ₹${finalAmount} collected via ${methodNames[paymentMethod]} for ${currentProcessingDevice.ticketId}! 💰`, 
            'success'
        );
        
        currentProcessingDevice = null;
        
        // Clear the inputs for next use
        document.getElementById('finalAmount').value = '';
        document.getElementById('paymentMethod').value = '';
        
        // Update revenue and refresh data
        await loadTodayRevenue();
        await loadAllDevices();
        
    } catch (error) {
        console.error('Error confirming payment collection:', error);
        showNotification('Failed to confirm payment collection', 'error');
    }
}


async function returnDevice(deviceId) {
    try {
        const device = findDeviceById(deviceId);
        if (!device) {
            showNotification('Device not found', 'error');
            return;
        }
        
        currentProcessingDevice = device;
        
        // Populate modal with device details
        document.getElementById('returnDeviceDetails').innerHTML = `
            <div class="device-summary">
                <strong>Ticket ID:</strong> ${device.ticketId}<br>
                <strong>Customer:</strong> ${device.customerName}<br>
                <strong>Device:</strong> ${device.deviceBrand} ${device.deviceModel}<br>
                <strong>Issue:</strong> ${device.issueDescription}
            </div>
        `;
        
        showModal('returnModal');
    } catch (error) {
        console.error('Error initiating device return:', error);
        showNotification('Failed to initiate device return', 'error');
    }
}
async function confirmDeviceReturn() {
    if (!currentProcessingDevice) return;
    
    try {
        const deviceRef = doc(db, 'repair_tickets', currentProcessingDevice.id);
        await updateDoc(deviceRef, {
            status: 'Returned to Customer',
            returnDate: Timestamp.now(),
            updatedAt: Timestamp.now()
        });
        
        closeModal('returnModal');
        showNotification(`Device ${currentProcessingDevice.ticketId} returned to customer`, 'success');
        currentProcessingDevice = null;
        
        // This will hide the card
        await loadAllDevices();
    } catch (error) {
        console.error('Error confirming device return:', error);
        showNotification('Failed to confirm device return', 'error');
    }
}
// Update your existing collectPayment function
async function collectPayment(deviceId) {
    console.log("collectPayment called with deviceId:", deviceId);
    
    try {
        const device = findDeviceById(deviceId);
        if (!device) {
            showNotification("Device not found", "error");
            return;
        }

        console.log("Setting currentProcessingDevice:", device);
        currentProcessingDevice = device;
        window.currentProcessingDevice = device;

        // Rest of your existing code...
        showModal("paymentModal");
        
        // Add this debug line
        console.log("Payment modal shown, currentProcessingDevice:", currentProcessingDevice);
        
    } catch (error) {
        console.error("Error in collectPayment:", error);
    }
}

async function processPaymentCollection(deviceId) {
    const paymentMethod = document.getElementById('paymentMethod').value;
    const finalAmount = parseFloat(document.getElementById('finalAmount').value);
    const paymentNotes = document.getElementById('paymentNotes').value;

    if (!paymentMethod || !finalAmount) {
        showNotification('Please fill all required fields', 'warning');
        return;
    }

    try {
        // Update device status
        await updateDoc(doc(db, 'repair_tickets', deviceId), {
            status: 'Handover Completed',
            paymentMethod: paymentMethod,
            finalPaymentAmount: finalAmount,
            paymentNotes: paymentNotes,
            paymentDate: Timestamp.now(),
            handoverDate: Timestamp.now(),
            updatedAt: Timestamp.now()
        });

        // Update revenue
        appState.revenue += finalAmount;

        // Log payment
        await addDoc(collection(db, 'payment_logs'), {
            ticketId: deviceId,
            amount: finalAmount,
            method: paymentMethod,
            notes: paymentNotes,
            timestamp: Timestamp.now(),
            type: 'offline_collection'
        });

        closeModal('paymentModal');
        showNotification(`Payment of ₹${finalAmount.toLocaleString('en-IN')} collected successfully! 💰`, 'success');
        await loadAllDevices();
        await loadTodayRevenue();

    } catch (error) {
        console.error('Error processing payment:', error);
        showNotification('Failed to process payment', 'error');
    }
}

// Fixed return processing function
async function processReturn(deviceId) {
    if (!confirm('Confirm device return to customer? This action cannot be undone.')) {
        return;
    }

    try {
        console.log(`Processing return for device: ${deviceId}`);
        
        // Update device status in Firebase - mark as picked up
        await updateDoc(doc(db, 'repair_tickets', deviceId), {
            status: 'Customer Picked Up', // Changed from 'Returned to Customer'
            customerPickupDate: Timestamp.now(), // New field to track actual pickup
            returnProcessedBy: 'Front Desk',
            handoverCompleted: true, // Mark handover as completed
            updatedAt: Timestamp.now()
        });

        console.log('Return processed successfully in Firebase');
        
        // Show success notification
        showNotification('Device returned to customer successfully! 📦', 'success');
        
        // Refresh the data to update the UI
        await loadAllDevices();
        await loadTodayRevenue();
        
        console.log('UI refreshed after return processing');

    } catch (error) {
        console.error('Error processing return:', error);
        showNotification('Failed to process return', 'error');
    }
}


// Device registration
async function submitDeviceRegistration() {
    const formData = {
        customerName: document.getElementById('customerName').value.trim(),
        customerMobile: document.getElementById('customerMobile').value.trim(),
        customerEmail: document.getElementById('customerEmail').value.trim(),
        customerAddress: document.getElementById('customerAddress').value.trim(),
        deviceBrand: document.getElementById('deviceBrand').value.trim(),
        deviceModel: document.getElementById('deviceModel').value.trim(),
        deviceProblem: document.getElementById('deviceProblem').value.trim(),
        estimatedCost: parseFloat(document.getElementById('estimatedCost').value) || 0,
        priority: document.getElementById('priorityLevel').value
    };

    // Validation
    if (!formData.customerName || !formData.customerMobile || !formData.deviceBrand || 
        !formData.deviceModel || !formData.deviceProblem || !formData.estimatedCost) {
        showNotification('Please fill all required fields', 'warning');
        return;
    }

    if (!/^[0-9]{10}$/.test(formData.customerMobile)) {
        showNotification('Please enter a valid 10-digit mobile number', 'warning');
        return;
    }

    try {
        const ticketId = generateTicketId();
        
        const deviceData = {
            ...formData,
            ticketId,
            status: 'Repair Not Started',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };

        await addDoc(collection(db, 'repair_tickets'), deviceData);
        
        closeModal('registrationModal');
        showSuccessModal(deviceData);
        showNotification('Device registered successfully! 📱', 'success');
        
        // Reset form
        document.getElementById('deviceRegistrationForm').reset();

    } catch (error) {
        console.error('Error registering device:', error);
        showNotification('Failed to register device', 'error');
    }
}

// Search functionality
async function performSearch() {
    const searchTerm = document.getElementById('searchInput').value.trim();
    if (!searchTerm) {
        showNotification('Please enter a search term', 'warning');
        return;
    }

    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = `
        <div class="loading-placeholder">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Searching for "${searchTerm}"...</p>
        </div>
    `;
    resultsContainer.classList.add('show');

    try {
        // Search queries
        const queries = [
            query(collection(db, 'repair_tickets'), where('ticketId', '==', searchTerm)),
            query(collection(db, 'repair_tickets'), where('customerMobile', '==', searchTerm)),
            query(collection(db, 'repair_tickets'), 
                where('customerName', '>=', searchTerm), 
                where('customerName', '<=', searchTerm + '\uf8ff'))
        ];

        let foundDevices = [];
        
        for (const q of queries) {
            const snapshot = await getDocs(q);
            snapshot.forEach(doc => {
                const device = { id: doc.id, ...doc.data() };
                if (!foundDevices.find(d => d.id === device.id)) {
                    foundDevices.push(device);
                }
            });
        }

        if (foundDevices.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>No Results Found</h3>
                    <p>No devices found matching "${searchTerm}"</p>
                </div>
            `;
            return;
        }

        resultsContainer.innerHTML = `
            <h4 style="margin-bottom: 1rem; color: #2d3748;">
                <i class="fas fa-search"></i> 
                Search Results (${foundDevices.length})
            </h4>
            <div class="devices-grid">
                ${foundDevices.map(device => createSearchResultCard(device)).join('')}
            </div>
        `;

    } catch (error) {
        console.error('Error performing search:', error);
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Search Error</h3>
                <p>An error occurred while searching</p>
            </div>
        `;
    }
}

function createSearchResultCard(device) {
    const statusClass = device.paymentStatus === 'paid_online' ? 'online-paid' : 
                       device.status?.toLowerCase().includes('complete') ? 'payment-pending' : 
                       device.status?.toLowerCase().includes('return') ? 'return-device' : '';
    const createdDate = device.createdAt ? 
        device.createdAt.toDate().toLocaleDateString('en-IN') : 'Unknown';

    return `
        <div class="device-card ${statusClass}" style="margin-bottom: 1rem;">
            <div class="device-header">
                <div class="device-id">${device.ticketId}</div>
                <div class="device-status ${device.paymentStatus === 'paid_online' ? 'online' : 'pending'}">
                    ${device.status || 'Unknown Status'}
                </div>
            </div>
            
            <div class="device-info">
                <div class="info-row">
                    <span class="info-label">Customer</span>
                    <span class="info-value">${device.customerName}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Mobile</span>
                    <span class="info-value">${device.customerMobile}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Device</span>
                    <span class="info-value">${device.deviceBrand} ${device.deviceModel}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Status</span>
                    <span class="info-value">${device.status}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Created</span>
                    <span class="info-value">${createdDate}</span>
                </div>
            </div>
        </div>
    `;
}

// Utility functions
function generateTicketId() {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2); // 2-digit year
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(100 + Math.random() * 900); // 3-digit random number
    return `${year}${month}${day}${random}`;
}
// function findDeviceById(deviceId) {
//     return [...appState.devices.handover, ...appState.devices.payment, ...appState.devices.returns]
//         .find(device => device.id === deviceId);
// }
function findDeviceById(deviceId) {
    for (const category in appState.devices) {
        const device = appState.devices[category].find(d => d.id === deviceId);
        if (device) return device;
    }
    return null;
}

async function loadTodayRevenue() {
    try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        
        const revenueQuery = query(
            collection(db, 'repair_tickets'),
            where('paymentCollectedDate', '>=', Timestamp.fromDate(startOfDay)),
            where('paymentCollectedDate', '<', Timestamp.fromDate(endOfDay))
        );
        
        const snapshot = await getDocs(revenueQuery);
        let totalRevenue = 0;
        
        snapshot.forEach(doc => {
            const device = doc.data();
            // Use finalAmount if available, otherwise fall back to estimatedCost
            const amount = device.finalAmount || device.estimatedCost || 0;
            totalRevenue += parseFloat(amount);
        });
        
        appState.revenue = totalRevenue;
        updateStatistics();
    } catch (error) {
        console.error('Error loading today\'s revenue:', error);
    }
}

function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('currentTime').textContent = timeString;
}

async function refreshAllData() {
    const btn = document.getElementById('refreshData');
    const originalHTML = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    btn.disabled = true;
    
    await loadAllDevices();
    await loadTodayRevenue();
    
    setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        showNotification('Data refreshed successfully! 🔄', 'success');
    }, 1000);
}

function focusSearchInput() {
    document.getElementById('searchInput').focus();
}

function startRealtimeUpdates() {
    // Listen for new online payments
    const paymentsQuery = query(
        collection(db, 'repair_tickets'),
        where('paymentStatus', '==', 'paid_online')
    );
    
    onSnapshot(paymentsQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' || change.type === 'modified') {
                const device = change.doc.data();
                if (!device.notificationShown) {
                    showNotification(`💳 Online payment received for ${device.ticketId}!`, 'success');
                    // Mark notification as shown
                    updateDoc(change.doc.ref, { notificationShown: true });
                }
            }
        });
        
        // Refresh data after changes
        loadAllDevices();
    });
}

// Modal functions
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
    document.body.style.overflow = 'hidden';
}

// function closeModal(modalId) {
//     document.getElementById(modalId).classList.remove('show');
//     document.body.style.overflow = 'auto';
// }
// Update your closeModal function or add this to the payment modal close handler
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
    document.body.style.overflow = 'auto';
    
    // Reset current processing device when payment modal is closed
    if (modalId === 'paymentModal') {
        currentProcessingDevice = null;
        resetPaymentModal();
    }
}
function openRegistrationModal() {
    showModal('registrationModal');
}
function resetPaymentModal() {
    // Reset single payment fields
    document.getElementById('finalAmount').value = '';
    document.getElementById('paymentMethod').value = '';
    document.getElementById('paymentNotes').value = '';
    
    // Reset split payment fields
    document.getElementById('splitTotalAmount').value = '';
    document.getElementById('splitPaymentsList').innerHTML = '';
    
    // Reset payment mode selection
    document.querySelector('input[name="paymentMode"][value="single"]').checked = true;
    document.getElementById('singlePaymentSection').style.display = 'block';
    document.getElementById('splitPaymentSection').style.display = 'none';
    
    // Reset split payment counter
    splitPaymentCounter = 0;
    
    // Clear current processing device
    currentProcessingDevice = null;
}
// function showSuccessModal(deviceData) {
//     const modalBody = document.getElementById('successModalBody');
    
//     modalBody.innerHTML = `
//         <div style="text-align: center; padding: 1rem;">
//             <div style="font-size: 4rem; color: #38a169; margin-bottom: 1rem;">
//                 <i class="fas fa-check-circle"></i>
//             </div>
//             <h3>Device Registered Successfully!</h3>
//             <p style="color: #718096; margin: 1rem 0;">
//                 Your device has been registered and assigned ticket ID:
//             </p>
//             <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 1rem; border-radius: 8px; font-size: 1.5rem; font-weight: 700; margin: 1rem 0;">
//                 ${deviceData.ticketId}
//             </div>
//             <div style="background: #f7fafc; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; text-align: left;">
//                 <div style="display: grid; gap: 0.5rem; font-size: 0.9rem;">
//                     <div style="display: flex; justify-content: space-between;">
//                         <span>Customer:</span> <strong>${deviceData.customerName}</strong>
//                     </div>
//                     <div style="display: flex; justify-content: space-between;">
//                         <span>Mobile:</span> <strong>${deviceData.customerMobile}</strong>
//                     </div>
//                     <div style="display: flex; justify-content: space-between;">
//                         <span>Device:</span> <strong>${deviceData.deviceBrand} ${deviceData.deviceModel}</strong>
//                     </div>
//                     <div style="display: flex; justify-content: space-between;">
//                         <span>Priority:</span> <strong>${deviceData.priority}</strong>
//                     </div>
//                     <div style="display: flex; justify-content: space-between;">
//                         <span>Estimated:</span> <strong>₹${deviceData.estimatedCost.toLocaleString('en-IN')}</strong>
//                     </div>
//                 </div>
//             </div>
//             <p style="color: #718096; font-size: 0.9rem;">
//                 Please save this ticket ID for tracking purposes.
//             </p>
//         </div>
//     `;
    
//     showModal('successModal');
// }

// Notification functions
function showNotification(message, type = 'info') {
    const notificationBar = document.getElementById('notificationsBar');
    const notificationMessage = document.getElementById('notificationMessage');
    
    notificationMessage.textContent = message;
    notificationBar.className = `notifications-bar ${type}`;
    notificationBar.style.display = 'flex';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideNotification();
    }, 5000);
}

function hideNotification() {
    document.getElementById('notificationsBar').style.display = 'none';
}

// Make functions globally available
window.confirmHandover = confirmHandover;
window.completeHandover = completeHandover;
window.collectPayment = collectPayment;
window.processPaymentCollection = processPaymentCollection;
window.processReturn = processReturn;
window.closeModal = closeModal;
window.openRegistrationModal = openRegistrationModal;
window.performSearch = performSearch;
// Add barcode scanning functionality
function setupBarcodeScanning() {
    const barcodeInput = document.getElementById('barcodeInput');
    const scanBtn = document.getElementById('scanBarcodeBtn');
    
    // Focus on barcode input when scan button is clicked
    scanBtn.addEventListener('click', () => {
        barcodeInput.focus();
    });
    
    // Auto-search when barcode is scanned
    barcodeInput.addEventListener('input', (e) => {
        const barcode = e.target.value.trim();
        if (barcode.length >= 8) { // Minimum barcode length
            setTimeout(() => {
                performBarcodeSearch(barcode);
                barcodeInput.value = ''; // Clear after search
            }, 500);
        }
    });
    
    // Also search on Enter key
    barcodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const barcode = e.target.value.trim();
            if (barcode) {
                performBarcodeSearch(barcode);
                barcodeInput.value = '';
            }
        }
    });
}

// Perform barcode-based search
async function performBarcodeSearch(barcode) {
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = `
        <div class="loading-placeholder">
            <i class="fas fa-barcode fa-spin"></i>
            <p>Searching for barcode "${barcode}"...</p>
        </div>
    `;
    resultsContainer.classList.add('show');

    try {
        // Search by ticket ID (barcode should contain ticket ID)
        const q = query(collection(db, 'repair_tickets'), where('ticketId', '==', barcode));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-barcode"></i>
                    <h3>Barcode Not Found</h3>
                    <p>No device found with barcode "${barcode}"</p>
                </div>
            `;
            return;
        }
        
        const device = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        
        resultsContainer.innerHTML = `
            <h4 style="margin-bottom: 1rem; color: #2d3748;">
                <i class="fas fa-barcode"></i> 
                Barcode Search Result
            </h4>
            <div class="devices-grid">
                ${createSearchResultCard(device)}
            </div>
        `;
        
        showNotification(`Device found: ${device.ticketId}! 📱`, 'success');

    } catch (error) {
        console.error('Error performing barcode search:', error);
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Search Error</h3>
                <p>An error occurred while searching</p>
            </div>
        `;
    }
}

// Generate small barcode for ticket ID
function generateSmallBarcode(ticketId, containerId) {
    const container = document.getElementById(containerId);
    if (container && window.JsBarcode) {
        // Clear previous barcode
        container.innerHTML = '';
        
        // Create canvas for barcode
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);
        
        // Generate compact barcode
        JsBarcode(canvas, ticketId, {
            format: 'CODE128',
            width: 1,
            height: 40,
            displayValue: true,
            fontSize: 10,
            margin: 5,
            background: 'white',
            lineColor: 'black'
        });
    }
}

// Show print receipt modal
function showPrintReceiptModal(deviceData) {
    const modal = document.getElementById('printReceiptModal');
    const preview = document.getElementById('printPreview');
    
    // Generate receipt preview
    preview.innerHTML = generateReceiptPreview(deviceData);
    
    // Generate barcode in preview
    setTimeout(() => {
        generateSmallBarcode(deviceData.ticketId, 'previewBarcode');
    }, 100);
    
    showModal('printReceiptModal');
}

// Generate receipt preview
function generateReceiptPreview(device) {
    const currentDate = new Date().toLocaleDateString('en-IN');
    const currentTime = new Date().toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    return `
        <div style="max-width: 400px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 16px; font-weight: bold;">PhoneCare Repairing</div>
                <div style="font-size: 12px; margin: 5px 0;">Professional Mobile Repair Center</div>
                <div style="font-size: 12px;">Ph: +91 93407 57231 | Email: myphonecare@gmail.com</div>
                <div style="font-weight: bold; margin-top: 10px; padding: 5px; background: #f0f0f0;">
                    Repairing Receipt
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-weight: bold;">
                <span>Ticket: ${device.ticketId}</span>
                <span>${currentDate} ${currentTime}</span>
            </div>
            
            <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: bold;">Customer:</span>
                    <span>${device.customerName}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: bold;">Mobile:</span>
                    <span>${device.customerMobile}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: bold;">Device:</span>
                    <span>${device.deviceBrand} ${device.deviceModel}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: bold;">Problem:</span>
                    <span>${device.deviceProblem}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: bold;">Priority:</span>
                    <span>${device.priority}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; font-weight: bold;">
                    <span>Estimated Cost:</span>
                    <span>₹${device.estimatedCost.toLocaleString('en-IN')}</span>
                </div>
            </div>
            
            <div id="previewBarcode" class="compact-barcode-container"></div>

            
            <div style="text-align: center; font-size: 11px; margin-top: 15px; padding-top: 10px; border-top: 1px solid #ddd; color: #666;">
                <div>Keep this receipt safe for device collection</div>
                <div>Repair status: www.phonecare.com/track</div>
                <div>Terms: Subject to diagnosis. Charges may vary.</div>
            </div>
        </div>
    `;
}

// Print dual receipt
function printDualReceipt() {
    const printableContent = document.getElementById('printableReceipt');
    printableContent.innerHTML = generateDualReceipt();
    
    // Generate barcodes for both copies
    setTimeout(() => {
        generateSmallBarcode(window.currentDeviceData.ticketId, 'barcode1');
        generateSmallBarcode(window.currentDeviceData.ticketId, 'barcode2');
        
        // Print after barcodes are generated
        setTimeout(() => {
            window.print();
        }, 500);
    }, 100);
    
    closeModal('printReceiptModal');
}

// Compact dual receipt generator - fits 2 receipts on single A5 page

function generateDualReceipt() {
    const device = window.currentDeviceData;
    const currentDate = new Date().toLocaleDateString('en-IN');
    const currentTime = new Date().toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // Full customer receipt with all details
    const customerReceipt = `
        <div class="receipt-header">
            <div class="shop-name">PHONECARE</div>
            <div class="shop-tagline">SHOP NO 27, Mahanadi Complex, Niharika, Korba</div>
            <div class="shop-contact">Ph: +91 9340757231 (Technician) | myphonecare.info</div>
            <div class="receipt-type">CUSTOMER COPY</div>
        </div>

        <div class="main-info">
            <div class="ticket-section">
                <div class="ticket-id">Tracking: ${device.ticketId}</div>
                <div class="ticket-date">${currentDate} ${currentTime}</div>
                <div id="barcode1" class="barcode-inline"></div>
            </div>
            
            <div class="device-info">
                <div class="info-row"><span>Customer:</span><span>${device.customerName}</span></div>
                <div class="info-row"><span>Mobile:</span><span>${device.customerMobile}</span></div>
                <div class="info-row"><span>Device:</span><span>${device.deviceBrand} ${device.deviceModel}</span></div>
                <div class="info-row"><span>Problem:</span><span>${device.deviceProblem}</span></div>
                <div class="info-row"><span>Priority:</span><span>${device.priority}</span></div>
                <div class="info-row amount"><span>Est. Cost (may vary*):</span><span>Rs.${device.estimatedCost.toLocaleString('en-IN')}</span></div>
            </div>
        </div>

        <div class="terms-footer">
            <div class="terms">
                <strong>Terms:</strong> No warranty on repairs • Check device at delivery • Not responsible for damage during repair
            </div>
            <div class="footer">Track: <strong>myphonecare.info</strong> | Keep receipt safe for collection</div>
            <div class="signature">
                <span>Customer: ____________</span>
                <span>PhoneCare: ____________</span>
            </div>
        </div>
    `;

    // Minimal store copy with essential info only
    const storeReceipt = `
        <div class="store-header">
            <div class="shop-name">PHONECARE - STORE COPY</div>
            <div class="ticket-id-store">${device.ticketId} | ${currentDate} ${currentTime}</div>
        </div>

        <div class="store-info">
            <div class="info-grid">
                <div class="info-item">
                    <strong>Customer:</strong> ${device.customerName}<br>
                    <strong>Mobile:</strong> ${device.customerMobile}
                </div>
                <div class="info-item">
                    <strong>Device:</strong> ${device.deviceBrand} ${device.deviceModel}<br>
                    <strong>Cost:</strong> Rs.${device.estimatedCost.toLocaleString('en-IN')}
                </div>
            </div>
            <div class="problem-text"><strong>Problem:</strong> ${device.deviceProblem}</div>
            <div id="barcode2" class="barcode-store"></div>
        </div>
    `;
    
    return `
        <style>
            @media print {
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                @page {
                    size: A5;
                    margin: 4mm;
                }
                
                body {
                    font-family: 'Arial', sans-serif;
                    color: #000;
                    background: white;
                    font-size: 9px;
                    line-height: 1.2;
                }
                
                .dual-receipt {
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    gap: 2mm;
                }
                
                /* CUSTOMER RECEIPT - 65% of page */
                .customer-receipt {
                    flex: 0 0 65%;
                    border: 2px solid #000;
                    padding: 2mm;
                    display: flex;
                    flex-direction: column;
                }
                
                .receipt-header {
                    text-align: center;
                    border-bottom: 1px solid #000;
                    padding-bottom: 1mm;
                    margin-bottom: 2mm;
                }
                
                .shop-name {
                    font-size: 20px;
                    font-weight: 900;
                    letter-spacing: 2px;
                    margin-bottom: 0.5mm;
                    color: #000;
                }
                
                .shop-tagline {
                    font-size: 7px;
                    margin-bottom: 0.5mm;
                    color: #000;
                }
                
                .shop-contact {
                    font-size: 12px;
                    font-weight: 900;
                    margin-bottom: 1mm;
                    color: #000;
                }
                
                .receipt-type {
                    font-size: 8px;
                    font-weight: 700;
                    background: #000;
                    color: white;
                    padding: 1mm 2mm;
                    border-radius: 1mm;
                }
                
                .main-info {
                    flex: 1;
                    display: flex;
                    gap: 2mm;
                }
                
                .ticket-section {
                    flex: 0 0 35%;
                    text-align: center;
                    border-right: 1px solid #ccc;
                    padding-right: 2mm;
                }
                
                .ticket-id {
                    font-size: 10px;
                    font-weight: 900;
                    margin-bottom: 1mm;
                }
                
                .ticket-date {
                    font-size: 7px;
                    margin-bottom: 2mm;
                }
                
                .barcode-inline {
                    margin: 1mm 0;
                }
                
                .barcode-inline canvas {
                    max-width: 100%;
                    height: 12mm !important;
                }
                
                .device-info {
                    flex: 1;
                    padding-left: 2mm;
                }
                
                .info-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 1mm;
                    font-size: 8px;
                }
                
                .info-row span:first-child {
                    font-weight: 700;
                    width: 35%;
                }
                
                .info-row span:last-child {
                    width: 63%;
                    text-align: right;
                    word-wrap: break-word;
                }
                
                .info-row.amount {
                    border-top: 1px solid #000;
                    padding-top: 1mm;
                    margin-top: 1mm;
                    font-size: 9px;
                    font-weight: 900;
                }
                
                .terms-footer {
                    border-top: 1px solid #000;
                    padding-top: 1mm;
                    margin-top: 1mm;
                }
                
                .terms {
                    font-size: 6px;
                    text-align: justify;
                    margin-bottom: 1mm;
                    line-height: 1.1;
                }
                
                .footer {
                    font-size: 7px;
                    text-align: center;
                    margin-bottom: 1mm;
                }
                
                .signature {
                    display: flex;
                    justify-content: space-between;
                    font-size: 6px;
                    margin-top: 1mm;
                }
                
                /* STORE RECEIPT - 33% of page */
                .store-receipt {
                    flex: 0 0 33%;
                    border: 2px solid #000;
                    padding: 2mm;
                }
                
                .store-header {
                    text-align: center;
                    border-bottom: 1px solid #000;
                    padding-bottom: 1mm;
                    margin-bottom: 2mm;
                }
                
                .store-header .shop-name {
                    font-size: 12px;
                    font-weight: 900;
                    margin-bottom: 0.5mm;
                }
                
                .ticket-id-store {
                    font-size: 9px;
                    font-weight: 700;
                }
                
                .store-info {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }
                
                .info-grid {
                    display: flex;
                    gap: 2mm;
                    margin-bottom: 2mm;
                }
                
                .info-item {
                    flex: 1;
                    font-size: 7px;
                    line-height: 1.3;
                }
                
                .problem-text {
                    font-size: 7px;
                    margin-bottom: 2mm;
                    text-align: justify;
                }
                
                .barcode-store {
                    text-align: center;
                    margin-top: 3mm;
                }
                
                .barcode-store canvas {
                    max-width: 80%;
                    height: 15mm !important;
                }
                
                /* Hide non-print elements */
                .modal, .main-container, .main-header, .notifications-bar {
                    display: none !important;
                }
                
                #printableReceipt {
                    display: block !important;
                }
            }
            
            /* Screen preview styles */
            @media screen {
                .dual-receipt {
                    max-width: 148mm;
                    margin: 0 auto;
                    background: white;
                    min-height: 210mm;
                }
                
                .customer-receipt, .store-receipt {
                    border: 2px solid #000;
                    padding: 2mm;
                    margin-bottom: 2mm;
                    font-family: Arial, sans-serif;
                }
                
                .shop-name {
                    font-size: 20px !important;
                    font-weight: 900 !important;
                }
                
                .shop-contact {
                    font-size: 12px !important;
                    font-weight: 900 !important;
                }
            }
        </style>
        
        <div class="dual-receipt">
            <div class="customer-receipt">
                ${customerReceipt}
            </div>
            <div class="store-receipt">
                ${storeReceipt}
            </div>
        </div>
    `;
}

// Update the device registration success to show receipt
function showSuccessModal(deviceData) {
    // Store device data for printing
    window.currentDeviceData = deviceData;
    
    const modalBody = document.getElementById('successModalBody');
    
    modalBody.innerHTML = `
        <div style="text-align: center; padding: 1rem;">
            <div style="font-size: 4rem; color: #38a169; margin-bottom: 1rem;">
                <i class="fas fa-check-circle"></i>
            </div>
            <h3>Device Registered Successfully!</h3>
            <p style="color: #718096; margin: 1rem 0;">
                Your device has been registered and assigned ticket ID:
            </p>
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 1rem; border-radius: 8px; font-size: 1.5rem; font-weight: 700; margin: 1rem 0;">
                ${deviceData.ticketId}
            </div>
            
            <!-- Small barcode display -->
            <div id="successBarcode" style="margin: 1.5rem 0; padding: 1rem; background: white; border: 1px solid #e2e8f0; border-radius: 8px;"></div>
            
            <div style="background: #f7fafc; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; text-align: left;">
                <div style="display: grid; gap: 0.5rem; font-size: 0.9rem;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Customer:</span> <strong>${deviceData.customerName}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Mobile:</span> <strong>${deviceData.customerMobile}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Device:</span> <strong>${deviceData.deviceBrand} ${deviceData.deviceModel}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Priority:</span> <strong>${deviceData.priority}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Estimated:</span> <strong>₹${deviceData.estimatedCost.toLocaleString('en-IN')}</strong>
                    </div>
                </div>
            </div>
            
            <button class="btn primary" onclick="showPrintReceiptModal(window.currentDeviceData)" style="width: 100%; margin-top: 1rem;">
                <i class="fas fa-print"></i>
                Print Receipt
            </button>
            
            <p style="color: #718096; font-size: 0.9rem; margin-top: 1rem;">
                Please save this ticket ID for tracking purposes.
            </p>
        </div>
    `;
    
    // Generate barcode in success modal
    setTimeout(() => {
        generateSmallBarcode(deviceData.ticketId, 'successBarcode');
    }, 100);
    
    showModal('successModal');
}

// Initialize barcode scanning when app starts
document.addEventListener('DOMContentLoaded', function() {
    initializeSmartApp();
    setupEventListeners();
    setupBarcodeScanning(); // Add this line
     setupPaymentModal(); // Add this line
    startRealtimeUpdates();
});

// Enhanced Payment Collection JavaScript
let splitPaymentCounter = 0;

// Initialize payment modal functionality
document.addEventListener('DOMContentLoaded', function() {
    setupPaymentModal();
});

function setupPaymentModal() {
    // Payment mode selection
    const paymentModeInputs = document.querySelectorAll('input[name="paymentMode"]');
    paymentModeInputs.forEach(input => {
        input.addEventListener('change', handlePaymentModeChange);
    });

    // Add split payment button
    document.getElementById('addSplitPayment').addEventListener('click', addSplitPaymentRow);

    // Split total amount change
    document.getElementById('splitTotalAmount').addEventListener('input', updateSplitSummary);

    // Enhanced confirm payment button
    document.getElementById('confirmPayment').addEventListener('click', function(e) {
        e.preventDefault();
        handlePaymentConfirmation();
    });
}

function handlePaymentModeChange(e) {
    const singleSection = document.getElementById('singlePaymentSection');
    const splitSection = document.getElementById('splitPaymentSection');
    
    if (e.target.value === 'single') {
        singleSection.style.display = 'block';
        splitSection.style.display = 'none';
        clearSplitPayments();
    } else {
        singleSection.style.display = 'none';
        splitSection.style.display = 'block';
        initializeSplitPayments();
    }
}

function initializeSplitPayments() {
    // Clear existing split payments
    clearSplitPayments();
    // Add first split payment row
    addSplitPaymentRow();
}

function addSplitPaymentRow() {
    splitPaymentCounter++;
    const container = document.getElementById('splitPaymentsList');
    
    const splitItem = document.createElement('div');
    splitItem.className = 'split-payment-item';
    splitItem.dataset.id = splitPaymentCounter;
    
    splitItem.innerHTML = `
        <div class="form-group">
            <label>Method:</label>
            <select class="split-method" required>
                <option value="">Select</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI/Online</option>
                <option value="card">Card/POS</option>
            </select>
        </div>
        <div class="form-group">
            <label>Amount (₹):</label>
            <input type="number" class="split-amount" placeholder="0.00" min="0" step="0.01" required>
        </div>
        <button type="button" class="remove-split" onclick="removeSplitPaymentRow(${splitPaymentCounter})">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(splitItem);
    
    // Add event listeners for real-time updates
    const amountInput = splitItem.querySelector('.split-amount');
    amountInput.addEventListener('input', updateSplitSummary);
    
    updateSplitSummary();
}

function removeSplitPaymentRow(id) {
    const item = document.querySelector(`[data-id="${id}"]`);
    if (item) {
        item.remove();
        updateSplitSummary();
    }
    
    // Ensure at least one payment row exists
    const remainingItems = document.querySelectorAll('.split-payment-item');
    if (remainingItems.length === 0) {
        addSplitPaymentRow();
    }
}

function updateSplitSummary() {
    const totalAmount = parseFloat(document.getElementById('splitTotalAmount').value) || 0;
    const splitAmounts = document.querySelectorAll('.split-amount');
    
    let collectedAmount = 0;
    splitAmounts.forEach(input => {
        collectedAmount += parseFloat(input.value) || 0;
    });
    
    const remaining = totalAmount - collectedAmount;
    
    // Update summary display
    document.getElementById('summaryTotal').textContent = `₹${totalAmount.toLocaleString('en-IN')}`;
    document.getElementById('summaryCollected').textContent = `₹${collectedAmount.toLocaleString('en-IN')}`;
    document.getElementById('summaryRemaining').textContent = `₹${remaining.toLocaleString('en-IN')}`;
    
    // Update balance row styling
    const balanceRow = document.querySelector('.balance-row');
    balanceRow.classList.remove('balanced', 'unbalanced');
    
    if (remaining === 0 && totalAmount > 0) {
        balanceRow.classList.add('balanced');
    } else if (remaining !== 0) {
        balanceRow.classList.add('unbalanced');
    }
    
    // Enable/disable confirm button
    const confirmBtn = document.getElementById('confirmPayment');
    confirmBtn.disabled = remaining !== 0 || totalAmount <= 0;
}

function clearSplitPayments() {
    document.getElementById('splitPaymentsList').innerHTML = '';
    document.getElementById('splitTotalAmount').value = '';
    splitPaymentCounter = 0;
    updateSplitSummary();
}

async function handlePaymentConfirmation() {
    console.log("Payment confirmation triggered");
    
    if (!currentProcessingDevice) {
        showNotification("No device selected for payment", "error");
        return;
    }

    const paymentMode = document.querySelector('input[name="paymentMode"]:checked')?.value;
    
    if (!paymentMode) {
        showNotification("Please select a payment mode", "error");
        return;
    }

    try {
        if (paymentMode === "single") {
            await processSinglePayment();
        } else {
            await processSplitPayment();
        }
    } catch (error) {
        console.error("Payment confirmation error:", error);
        showNotification("Failed to process payment", "error");
    }
}


async function processSinglePayment() {
    const finalAmount = document.getElementById("finalAmount").value;
    const paymentMethod = document.getElementById("paymentMethod").value;
    const paymentNotes = document.getElementById("paymentNotes").value;

    // Validation
    if (!finalAmount || parseFloat(finalAmount) <= 0) {
        showNotification("Please enter a valid payment amount", "error");
        document.getElementById("finalAmount").focus();
        return;
    }

    if (!paymentMethod) {
        showNotification("Please select a payment method", "error");
        document.getElementById("paymentMethod").focus();
        return;
    }

    try {
        const deviceRef = doc(db, "repairtickets", currentProcessingDevice.id);
        const paymentData = {
            status: "Payment Collected",
            paymentStatus: "collected",
            finalAmount: parseFloat(finalAmount),
            finalPaymentAmount: parseFloat(finalAmount),
            paymentMethod: paymentMethod,
            paymentNotes: paymentNotes,
            paymentType: "single",
            paymentCollectedDate: Timestamp.now(),
            updatedAt: Timestamp.now()
        };

        await updateDoc(deviceRef, paymentData);

        // Create payment log entry
        await addDoc(collection(db, "paymentlogs"), {
            ticketId: currentProcessingDevice.ticketId,
            customerName: currentProcessingDevice.customerName,
            deviceInfo: `${currentProcessingDevice.deviceBrand} ${currentProcessingDevice.deviceModel}`,
            amount: parseFloat(finalAmount),
            method: paymentMethod,
            type: "singlepayment",
            timestamp: Timestamp.now(),
            deviceId: currentProcessingDevice.id,
            notes: paymentNotes
        });

        closeModal("paymentModal");
        showNotification(`Payment of ₹${finalAmount} collected via ${getPaymentMethodName(paymentMethod)}!`, "success");
        
        resetPaymentModal();
        await loadTodayRevenue();
        await loadAllDevices();
        
    } catch (error) {
        console.error("Error processing single payment:", error);
        showNotification("Failed to process payment", "error");
    }
}

async function processSplitPayment() {
    const totalAmount = parseFloat(document.getElementById('splitTotalAmount').value);
    const paymentNotes = document.getElementById('paymentNotes').value;
    const splitItems = document.querySelectorAll('.split-payment-item');
    
    // Validate split payments
    if (!totalAmount || totalAmount <= 0) {
        showNotification('Please enter a valid total amount', 'error');
        return;
    }
    
    const splitPayments = [];
    let totalCollected = 0;
    
    for (let item of splitItems) {
        const method = item.querySelector('.split-method').value;
        const amount = parseFloat(item.querySelector('.split-amount').value) || 0;
        
        if (!method) {
            showNotification('Please select payment method for all splits', 'error');
            return;
        }
        
        if (amount <= 0) {
            showNotification('Please enter valid amounts for all payment methods', 'error');
            return;
        }
        
        splitPayments.push({ method, amount });
        totalCollected += amount;
    }
    
    if (Math.abs(totalCollected - totalAmount) > 0.01) {
        showNotification('Split payments must equal the total amount', 'error');
        return;
    }
    
    try {
        // Update device record
        const deviceRef = doc(db, 'repair_tickets', currentProcessingDevice.id);
        const paymentData = {
            status: 'Payment Collected',
            paymentStatus: 'collected',
            finalAmount: totalAmount,
            finalPaymentAmount: totalAmount,
            paymentMethod: 'split',
            paymentNotes: paymentNotes,
            paymentType: 'split',
            splitPayments: splitPayments,
            paymentCollectedDate: Timestamp.now(),
            updatedAt: Timestamp.now()
        };
        
        await updateDoc(deviceRef, paymentData);
        
        // Create individual payment log entries for each split
        for (let split of splitPayments) {
            await addDoc(collection(db, 'payment_logs'), {
                ticketId: currentProcessingDevice.ticketId,
                customerName: currentProcessingDevice.customerName,
                deviceInfo: `${currentProcessingDevice.deviceBrand} ${currentProcessingDevice.deviceModel}`,
                amount: split.amount,
                method: split.method,
                type: 'split_payment',
                totalAmount: totalAmount,
                splitCount: splitPayments.length,
                timestamp: Timestamp.now(),
                deviceId: currentProcessingDevice.id,
                notes: paymentNotes
            });
        }
        
        closeModal('paymentModal');
        
        // Create success message
        const methodSummary = splitPayments.map(s => 
            `₹${s.amount} via ${getPaymentMethodName(s.method)}`
        ).join(', ');
        
        showNotification(`Split payment collected: ${methodSummary}`, 'success');
        
        resetPaymentModal();
        await loadTodayRevenue();
        await loadAllDevices();
        
    } catch (error) {
        console.error('Error processing split payment:', error);
        showNotification('Failed to process split payment', 'error');
    }
}

function getPaymentMethodName(method) {
    const methodNames = {
        'cash': 'Cash',
        'upi': 'UPI/Online',
        'card': 'Card/POS'
    };
    return methodNames[method] || method;
}



// Make functions globally available
window.removeSplitPaymentRow = removeSplitPaymentRow;
window.resetPaymentModal = resetPaymentModal;
window.handlePaymentConfirmation = handlePaymentConfirmation;
// Make functions globally available
window.processSinglePayment = processSinglePayment;
window.processSplitPayment = processSplitPayment;

// Make functions globally available
window.showPrintReceiptModal = showPrintReceiptModal;
window.printDualReceipt = printDualReceipt;
window.generateSmallBarcode = generateSmallBarcode;
