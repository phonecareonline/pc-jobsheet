// Firebase imports - Use the same config as your main app
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import { 
    getFirestore, 
    collection, 
    query, 
    orderBy, 
    where, 
    getDocs,
    doc,
    deleteDoc,
    Timestamp 
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';

// Firebase configuration - Replace with your actual config
const firebaseConfig = {
    // Add your Firebase configuration here
    // You can copy this from your main app's config
    apiKey: "your-api-key",
    authDomain: "your-auth-domain",
    projectId: "your-project-id",
    storageBucket: "your-storage-bucket",
    messagingSenderId: "your-messaging-sender-id",
    appId: "your-app-id"
};

// Initialize Firebase
let app, db;
try {
    // Check if Firebase config is available globally first
    if (window.firebaseConfig) {
        app = initializeApp(window.firebaseConfig);
    } else {
        // Use the local config as fallback
        app = initializeApp(firebaseConfig);
    }
    db = getFirestore(app);
    console.log('✅ Firebase initialized successfully');
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
    alert('Firebase configuration error. Please check your configuration.');
}

// Global state
let registryState = {
    allDevices: [],
    filteredDevices: [],
    currentDevice: null,
    filters: {
        dateRange: 'all',
        status: 'all',
        priority: 'all',
        search: ''
    }
};

// Initialize the registry page
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Initializing Device Registry...');
    
    setupEventListeners();
    loadAllRegisteredDevices();
});

// Setup all event listeners
function setupEventListeners() {
    // Filter controls
    document.getElementById('dateFilter').addEventListener('change', handleDateFilterChange);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('priorityFilter').addEventListener('change', applyFilters);
    document.getElementById('searchRegistry').addEventListener('input', debounce(applyFilters, 300));
    document.getElementById('startDate').addEventListener('change', applyFilters);
    document.getElementById('endDate').addEventListener('change', applyFilters);
    
    // Action buttons
    document.getElementById('refreshRegistry').addEventListener('click', refreshRegistry);
    document.getElementById('closeNotification').addEventListener('click', hideNotification);
    
    // Modal close events
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
    
    // Search on Enter key
    document.getElementById('searchRegistry').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });
}

// Load all registered devices from Firebase
async function loadAllRegisteredDevices() {
    try {
        showLoading(true);
        console.log('📊 Loading all registered devices...');
        
        const devicesQuery = query(
            collection(db, 'repair_tickets'),
            orderBy('createdAt', 'desc')
        );
        
        const snapshot = await getDocs(devicesQuery);
        const devices = [];
        
        snapshot.forEach(doc => {
            const device = { id: doc.id, ...doc.data() };
            devices.push(device);
        });
        
        registryState.allDevices = devices;
        registryState.filteredDevices = devices;
        
        console.log(`✅ Loaded ${devices.length} devices successfully`);
        
        updateUI();
        showLoading(false);
        
        showNotification(`Loaded ${devices.length} registered devices`, 'success');
        
    } catch (error) {
        console.error('❌ Error loading devices:', error);
        showLoading(false);
        showNotification('Failed to load device registry', 'error');
    }
}

// Handle date filter changes
function handleDateFilterChange() {
    const dateFilter = document.getElementById('dateFilter').value;
    const customDateRange = document.getElementById('customDateRange');
    
    if (dateFilter === 'custom') {
        customDateRange.style.display = 'flex';
        // Set default dates
        const today = new Date();
        const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
        
        document.getElementById('startDate').value = oneMonthAgo.toISOString().split('T')[0];
        document.getElementById('endDate').value = today.toISOString().split('T')[0];
    } else {
        customDateRange.style.display = 'none';
    }
    
    applyFilters();
}

// Apply all filters to the device list
function applyFilters() {
    const filters = {
        dateRange: document.getElementById('dateFilter').value,
        status: document.getElementById('statusFilter').value,
        priority: document.getElementById('priorityFilter').value,
        search: document.getElementById('searchRegistry').value.toLowerCase().trim(),
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value
    };
    
    registryState.filters = filters;
    
    let filtered = [...registryState.allDevices];
    
    // Apply date filter
    filtered = applyDateFilter(filtered, filters);
    
    // Apply status filter
    if (filters.status !== 'all') {
        filtered = filtered.filter(device => {
            const status = device.status?.toLowerCase() || '';
            return status.includes(filters.status);
        });
    }
    
    // Apply priority filter
    if (filters.priority !== 'all') {
        filtered = filtered.filter(device => device.priority === filters.priority);
    }
    
    // Apply search filter
    if (filters.search) {
        filtered = filtered.filter(device => {
            const searchFields = [
                device.ticketId,
                device.customerName,
                device.customerMobile,
                device.deviceBrand,
                device.deviceModel,
                device.deviceProblem
            ].map(field => (field || '').toLowerCase());
            
            return searchFields.some(field => field.includes(filters.search));
        });
    }
    
    registryState.filteredDevices = filtered;
    updateUI();
    
    console.log(`🔍 Filtered ${filtered.length} devices from ${registryState.allDevices.length} total`);
}

// Apply date filter logic
function applyDateFilter(devices, filters) {
    if (filters.dateRange === 'all') {
        return devices;
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let startDate, endDate;
    
    switch (filters.dateRange) {
        case 'today':
            startDate = today;
            endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 1);
            break;
            
        case 'yesterday':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 1);
            endDate = today;
            break;
            
        case 'week':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 7);
            endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 1);
            break;
            
        case 'month':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
            break;
            
        case 'custom':
            if (filters.startDate && filters.endDate) {
                startDate = new Date(filters.startDate);
                endDate = new Date(filters.endDate);
                endDate.setDate(endDate.getDate() + 1); // Include end date
            } else {
                return devices;
            }
            break;
            
        default:
            return devices;
    }
    
    return devices.filter(device => {
        if (!device.createdAt) return false;
        
        const deviceDate = device.createdAt.toDate ? device.createdAt.toDate() : new Date(device.createdAt);
        return deviceDate >= startDate && deviceDate < endDate;
    });
}

// Clear all filters
function clearFilters() {
    document.getElementById('dateFilter').value = 'all';
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('priorityFilter').value = 'all';
    document.getElementById('searchRegistry').value = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('customDateRange').style.display = 'none';
    
    registryState.filteredDevices = registryState.allDevices;
    updateUI();
    
    showNotification('Filters cleared', 'success');
}

// Update the UI components
function updateUI() {
    updateStatistics();
    updateRegistryTable();
}

// Update header statistics
function updateStatistics() {
    const totalDevices = registryState.allDevices.length;
    const todayDevices = getTodayDevicesCount();
    
    document.getElementById('totalDevices').textContent = totalDevices;
    document.getElementById('todayDevices').textContent = todayDevices;
}

// Get today's device count
function getTodayDevicesCount() {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    
    return registryState.allDevices.filter(device => {
        if (!device.createdAt) return false;
        const deviceDate = device.createdAt.toDate ? device.createdAt.toDate() : new Date(device.createdAt);
        return deviceDate >= startOfDay && deviceDate < endOfDay;
    }).length;
}

// Update the registry table
function updateRegistryTable() {
    const tableContainer = document.getElementById('registryTableContainer');
    const tableBody = document.getElementById('registryTableBody');
    const emptyState = document.getElementById('emptyState');
    
    if (registryState.filteredDevices.length === 0) {
        tableContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }
    
    tableContainer.style.display = 'block';
    emptyState.style.display = 'none';
    
    tableBody.innerHTML = registryState.filteredDevices
        .map(device => createTableRow(device))
        .join('');
}

// Create table row for device
function createTableRow(device) {
    const createdDate = device.createdAt 
        ? (device.createdAt.toDate ? device.createdAt.toDate() : new Date(device.createdAt))
        : new Date();
    
    const formattedDate = createdDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const status = device.status || 'Unknown';
    const statusClass = getStatusClass(status);
    const priorityClass = getPriorityClass(device.priority);
    
    return `
        <tr>
            <td>
                <div class="ticket-id-cell">
                    <strong>${device.ticketId}</strong>
                </div>
            </td>
            <td>${device.customerName || 'N/A'}</td>
            <td>${device.customerMobile || 'N/A'}</td>
            <td>
                <div class="device-info">
                    <strong>${device.deviceBrand || 'N/A'}</strong>
                    <br>
                    <small>${device.deviceModel || 'N/A'}</small>
                </div>
            </td>
            <td>
                <div class="problem-text" title="${device.deviceProblem || 'N/A'}">
                    ${truncateText(device.deviceProblem || 'N/A', 50)}
                </div>
            </td>
            <td>
                <span class="priority-badge priority-${priorityClass}">
                    ${device.priority || 'N/A'}
                </span>
            </td>
            <td>
                <span class="status-badge status-${statusClass}">
                    ${status}
                </span>
            </td>
            <td>
                <div class="amount-cell">
                    ₹${(device.estimatedCost || 0).toLocaleString('en-IN')}
                </div>
            </td>
            <td>
                <div class="date-cell">
                    ${formattedDate}
                </div>
            </td>
            <td>
    <div class="action-buttons">
        <button class="action-btn view-btn" onclick="viewDeviceDetails('${device.id}')" title="View Details">
            <i class="fas fa-eye"></i>
        </button>
        <button class="action-btn print-btn" onclick="printDeviceReceipt('${device.id}')" title="Print Receipt">
            <i class="fas fa-print"></i>
        </button>
        <button class="action-btn delete-btn" onclick="confirmDeleteDevice('${device.id}')" title="Delete Device (Admin Only)">
            <i class="fas fa-trash"></i>
        </button>
    </div>
</td>
        </tr>
    `;
}

// Confirm device deletion
function confirmDeleteDevice(deviceId) {
    const device = findDeviceById(deviceId);
    if (!device) {
        showNotification('Device not found', 'error');
        return;
    }
    
    // Check if admin is locked out
    if (isAdminLockedOut()) {
        const remainingTime = getRemainingLockoutTime();
        showNotification(`Admin access locked. Try again in ${remainingTime} minutes.`, 'error');
        return;
    }
    
    // Set pending delete ID
    adminAuthState.pendingDeleteId = deviceId;
    
    // Show admin authentication modal
    showAdminAuthModal(device);
}
function showAdminAuthModal(device) {
    // Populate device preview
    const devicePreview = document.getElementById('devicePreview');
    devicePreview.innerHTML = `
        <h5><i class="fas fa-mobile-alt"></i> Device to be deleted:</h5>
        <div class="preview-detail">
            <span class="preview-label">Ticket ID:</span>
            <span class="preview-value">${device.ticketId}</span>
        </div>
        <div class="preview-detail">
            <span class="preview-label">Customer:</span>
            <span class="preview-value">${device.customerName}</span>
        </div>
        <div class="preview-detail">
            <span class="preview-label">Device:</span>
            <span class="preview-value">${device.deviceBrand} ${device.deviceModel}</span>
        </div>
        <div class="preview-detail">
            <span class="preview-label">Mobile:</span>
            <span class="preview-value">${device.customerMobile}</span>
        </div>
    `;
    
    // Reset modal state
    resetAuthModal();
    
    // Show modal
    showModal('adminAuthModal');
    
    // Focus on password input
    setTimeout(() => {
        document.getElementById('adminPassword').focus();
    }, 100);
}

function resetAuthModal() {
    const authForm = document.getElementById('authForm');
    const successMessage = document.getElementById('successMessage');
    const verifyBtn = document.getElementById('verifyPasswordBtn');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const authError = document.getElementById('authError');
    const passwordInput = document.getElementById('adminPassword');
    
    // Show auth form, hide success message
    authForm.style.display = 'flex';
    successMessage.style.display = 'none';
    
    // Show verify button, hide confirm button
    verifyBtn.style.display = 'inline-flex';
    confirmBtn.style.display = 'none';
    
    // Clear password and error
    passwordInput.value = '';
    authError.style.display = 'none';
    
    // Remove loading states
    verifyBtn.classList.remove('loading');
    verifyBtn.disabled = false;
    
    // Update button text based on lockout status
    if (isAdminLockedOut()) {
        const remainingTime = getRemainingLockoutTime();
        verifyBtn.textContent = `Locked (${remainingTime}m remaining)`;
        verifyBtn.disabled = true;
    } else {
        verifyBtn.innerHTML = '<i class="fas fa-key"></i> Verify & Delete';
    }
}

function verifyAdminPassword() {
    const passwordInput = document.getElementById('adminPassword');
    const authError = document.getElementById('authError');
    const verifyBtn = document.getElementById('verifyPasswordBtn');
    
    const enteredPassword = passwordInput.value.trim();
    
    // Check if locked out
    if (isAdminLockedOut()) {
        const remainingTime = getRemainingLockoutTime();
        showNotification(`Admin access locked. Try again in ${remainingTime} minutes.`, 'error');
        return;
    }
    
    // Validate password input
    if (!enteredPassword) {
        authError.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Please enter the admin password.';
        authError.style.display = 'flex';
        passwordInput.focus();
        return;
    }
    
    // Show loading state
    verifyBtn.classList.add('loading');
    verifyBtn.disabled = true;
    
    // Simulate verification delay (for better UX)
    setTimeout(() => {
        if (enteredPassword === ADMIN_CONFIG.password) {
            // Correct password
            adminAuthState.isAuthenticated = true;
            adminAuthState.sessionExpiry = Date.now() + (10 * 60 * 1000); // 10 minute session
            adminAuthState.attempts = 0; // Reset attempts on success
            
            showAuthSuccess();
            
            console.log('✅ Admin authentication successful');
            
        } else {
            // Incorrect password
            adminAuthState.attempts++;
            
            // Show error
            authError.innerHTML = `
                <i class="fas fa-times-circle"></i> 
                Incorrect password. ${ADMIN_CONFIG.maxAttempts - adminAuthState.attempts} attempts remaining.
            `;
            authError.style.display = 'flex';
            
            // Check if max attempts reached
            if (adminAuthState.attempts >= ADMIN_CONFIG.maxAttempts) {
                adminAuthState.lockedUntil = Date.now() + ADMIN_CONFIG.lockoutTime;
                authError.innerHTML = `
                    <i class="fas fa-lock"></i> 
                    Too many failed attempts. Admin access locked for ${ADMIN_CONFIG.lockoutTime / (1000 * 60)} minutes.
                `;
                
                // Close modal after short delay
                setTimeout(() => {
                    closeModal('adminAuthModal');
                    showNotification('Admin access locked due to multiple failed attempts', 'error');
                }, 2000);
                
                console.log('🔒 Admin access locked due to failed attempts');
            }
            
            // Clear password
            passwordInput.value = '';
            passwordInput.focus();
        }
        
        // Remove loading state
        verifyBtn.classList.remove('loading');
        verifyBtn.disabled = false;
    }, 800); // Simulate processing time
}
function showAuthSuccess() {
    const authForm = document.getElementById('authForm');
    const successMessage = document.getElementById('successMessage');
    const verifyBtn = document.getElementById('verifyPasswordBtn');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    
    // Hide auth form, show success message
    authForm.style.display = 'none';
    successMessage.style.display = 'block';
    
    // Switch buttons
    verifyBtn.style.display = 'none';
    confirmBtn.style.display = 'inline-flex';
    
    // Auto-focus on confirm button
    setTimeout(() => {
        confirmBtn.focus();
    }, 100);
    
    showNotification('Admin authentication successful', 'success');
}
function proceedWithDelete() {
    if (!adminAuthState.isAuthenticated || !adminAuthState.pendingDeleteId) {
        showNotification('Authentication required', 'error');
        return;
    }
    
    // Check session expiry
    if (adminAuthState.sessionExpiry && Date.now() > adminAuthState.sessionExpiry) {
        adminAuthState.isAuthenticated = false;
        showNotification('Admin session expired. Please authenticate again.', 'error');
        closeModal('adminAuthModal');
        return;
    }
    
    const deviceId = adminAuthState.pendingDeleteId;
    
    // Close modal
    closeModal('adminAuthModal');
    
    // Proceed with deletion
    deleteDevice(deviceId);
    
    // Clear pending delete
    adminAuthState.pendingDeleteId = null;
    
    console.log('🗑️ Proceeding with authorized device deletion');
}
document.addEventListener('DOMContentLoaded', function() {
    // Add this to your existing DOMContentLoaded listener
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                verifyAdminPassword();
            }
        });
    }
});
const originalCloseModal = window.closeModal;
window.closeModal = function(modalId) {
    if (modalId === 'adminAuthModal') {
        closeAdminAuthModal();
    } else {
        originalCloseModal(modalId);
    }
};
window.addEventListener('beforeunload', function() {
    // Clear sensitive authentication state
    adminAuthState = {
        attempts: 0,
        lockedUntil: null,
        pendingDeleteId: null,
        isAuthenticated: false,
        sessionExpiry: null
    };
})
function getAdminSessionStatus() {
    return {
        isAuthenticated: adminAuthState.isAuthenticated,
        isLockedOut: isAdminLockedOut(),
        remainingLockoutTime: getRemainingLockoutTime(),
        attempts: adminAuthState.attempts,
        maxAttempts: ADMIN_CONFIG.maxAttempts
    };
}
window.confirmDeleteDevice = confirmDeleteDevice;
window.verifyAdminPassword = verifyAdminPassword;
window.proceedWithDelete = proceedWithDelete;
function closeAdminAuthModal() {
    // Clear sensitive data when modal closes
    adminAuthState.pendingDeleteId = null;
    adminAuthState.isAuthenticated = false;
    
    // Clear password field
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) {
        passwordInput.value = '';
    }
    
    closeModal('adminAuthModal');
    
    console.log('🔐 Admin auth modal closed, session cleared');
}
// Delete device from Firebase
async function deleteDevice(deviceId) {
    try {
        const device = findDeviceById(deviceId);
        if (!device) {
            showNotification('Device not found', 'error');
            return;
        }
        
        // Show deleting state
        const deleteBtn = document.querySelector(`button[onclick="confirmDeleteDevice('${deviceId}')"]`);
        if (deleteBtn) {
            deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            deleteBtn.disabled = true;
        }
        
        console.log(`🗑️ Deleting device: ${device.ticketId}`);
        
        // Delete from Firebase
        await deleteDoc(doc(db, 'repair_tickets', deviceId));
        
        // Remove from local state
        registryState.allDevices = registryState.allDevices.filter(d => d.id !== deviceId);
        registryState.filteredDevices = registryState.filteredDevices.filter(d => d.id !== deviceId);
        
        // Update UI
        updateUI();
        
        console.log(`✅ Device deleted successfully: ${device.ticketId}`);
        showNotification(`Device ${device.ticketId} deleted successfully`, 'success');
        
    } catch (error) {
        console.error('❌ Error deleting device:', error);
        showNotification('Failed to delete device', 'error');
        
        // Re-enable delete button on error
        const deleteBtn = document.querySelector(`button[onclick="confirmDeleteDevice('${deviceId}')"]`);
        if (deleteBtn) {
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.disabled = false;
        }
    }
}

// Helper functions for styling
function getStatusClass(status) {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('not started')) return 'not-started';
    if (statusLower.includes('progress')) return 'in-progress';
    if (statusLower.includes('completed')) return 'completed';
    if (statusLower.includes('handed') || statusLower.includes('handover')) return 'handed-over';
    if (statusLower.includes('returned')) return 'returned';
    return 'not-started';
}

function getPriorityClass(priority) {
    if (!priority) return 'low';
    return priority.toLowerCase();
}

function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// View device details
function viewDeviceDetails(deviceId) {
    const device = findDeviceById(deviceId);
    if (!device) {
        showNotification('Device not found', 'error');
        return;
    }
    
    registryState.currentDevice = device;
    
    const detailsContent = document.getElementById('deviceDetailsContent');
    detailsContent.innerHTML = generateDeviceDetailsHTML(device);
    
    showModal('deviceDetailsModal');
}

// Generate device details HTML
function generateDeviceDetailsHTML(device) {
    const createdDate = device.createdAt 
        ? (device.createdAt.toDate ? device.createdAt.toDate() : new Date(device.createdAt))
        : new Date();
    
    const updatedDate = device.updatedAt 
        ? (device.updatedAt.toDate ? device.updatedAt.toDate() : new Date(device.updatedAt))
        : createdDate;
    
    return `
        <div class="device-details">
            <div class="detail-section">
                <h4><i class="fas fa-ticket-alt"></i> Ticket Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Ticket ID:</span>
                    <span class="detail-value"><strong>${device.ticketId}</strong></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value">
                        <span class="status-badge status-${getStatusClass(device.status)}">
                            ${device.status || 'Unknown'}
                        </span>
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Priority:</span>
                    <span class="detail-value">
                        <span class="priority-badge priority-${getPriorityClass(device.priority)}">
                            ${device.priority || 'N/A'}
                        </span>
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Registered:</span>
                    <span class="detail-value">${createdDate.toLocaleString('en-IN')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Last Updated:</span>
                    <span class="detail-value">${updatedDate.toLocaleString('en-IN')}</span>
                </div>
            </div>
            
            <div class="detail-section">
                <h4><i class="fas fa-user"></i> Customer Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Name:</span>
                    <span class="detail-value">${device.customerName || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Mobile:</span>
                    <span class="detail-value">${device.customerMobile || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Email:</span>
                    <span class="detail-value">${device.customerEmail || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Address:</span>
                    <span class="detail-value">${device.customerAddress || 'N/A'}</span>
                </div>
            </div>
            
            <div class="detail-section">
                <h4><i class="fas fa-mobile-alt"></i> Device Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Brand:</span>
                    <span class="detail-value">${device.deviceBrand || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Model:</span>
                    <span class="detail-value">${device.deviceModel || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Problem:</span>
                    <span class="detail-value">${device.deviceProblem || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Estimated Cost:</span>
                    <span class="detail-value"><strong>₹${(device.estimatedCost || 0).toLocaleString('en-IN')}</strong></span>
                </div>
                ${device.finalAmount ? `
                <div class="detail-row">
                    <span class="detail-label">Final Amount:</span>
                    <span class="detail-value"><strong>₹${device.finalAmount.toLocaleString('en-IN')}</strong></span>
                </div>
                ` : ''}
                ${device.paymentStatus ? `
                <div class="detail-row">
                    <span class="detail-label">Payment Status:</span>
                    <span class="detail-value">${device.paymentStatus}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Print device receipt
function printDeviceReceipt(deviceId) {
    const device = findDeviceById(deviceId);
    if (!device) {
        showNotification('Device not found', 'error');
        return;
    }
    
    registryState.currentDevice = device;
    
    // Show receipt modal
    const receiptPreview = document.getElementById('receiptPreview');
    receiptPreview.innerHTML = generateReceiptHTML(device);
    
    // Generate barcode after a short delay
    setTimeout(() => {
        generateBarcode(device.ticketId, 'receiptBarcode');
    }, 100);
    
    showModal('receiptModal');
}

// Print from details modal
function printFromDetails() {
    if (registryState.currentDevice) {
        closeModal('deviceDetailsModal');
        printDeviceReceipt(registryState.currentDevice.id);
    }
}

// Generate receipt HTML (same format as main app)
function generateReceiptHTML(device) {
    const currentDate = new Date().toLocaleDateString('en-IN');
    const currentTime = new Date().toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    return `
        <div class="receipt-preview">
            <div class="receipt-header">
                <div class="shop-name">PHONECARE</div>
                <div class="shop-tagline">SHOP NO 27, Mahanadi Complex, Niharika, Korba</div>
                <div class="shop-contact">Ph: +91 9202424973 (Technician) | myphonecare.info</div>
                <div class="receipt-type">DUPLICATE COPY</div>
            </div>

            <div class="ticket-info">
                <div class="ticket-left">
                    <div class="ticket-id">Tracking Code: ${device.ticketId}</div>
                    <div class="ticket-copy">Visit <b>myphonecare.info</b> and track your repairing status</div>
                </div>
                <div class="ticket-right">
                    <div class="ticket-date">${currentDate} ${currentTime}</div>
                </div>
            </div>

            <div class="device-info-section">
                <div class="section-title">Device Information</div>
                <div class="detail-row">
                    <span class="detail-label">Customer:</span>
                    <span class="detail-value">${device.customerName}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Mobile:</span>
                    <span class="detail-value">${device.customerMobile}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Email:</span>
                    <span class="detail-value">${device.customerEmail || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Device:</span>
                    <span class="detail-value">${device.deviceBrand} ${device.deviceModel}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Problem:</span>
                    <span class="detail-value">${device.deviceProblem}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Priority:</span>
                    <span class="detail-value">${device.priority}</span>
                </div>
                <div class="detail-row" style="border-top: 1px solid #333; padding-top: 1px; margin-top: 2px;">
                    <span class="detail-label">Estimated Cost(may vary*):</span>
                    <span class="detail-value amount">Rs.${device.estimatedCost.toLocaleString('en-IN')}</span>
                </div>
            </div>
            
            <div class="barcode-section">
                <div class="barcode-title">TRACKING CODE</div>
                <div id="receiptBarcode" class="compact-barcode-container"></div>
            </div>

            <div class="terms-conditions">
                <div class="terms-title">Terms & Conditions | Device Handling Policies</div>
                <ul class="terms-list">
                    <li>We (PHONECARE) reserve the right to refuse service to anyone.</li>
                    <li>We (PHONECARE) or any technician under us, is NOT responsible if equipment is damaged,water damaged, data damaged or broken during the event of testing/repairing/servicing.</li>
                    <li>The delivery data indicated in the receipt is approximate and may vary as per nature of repair and availability of spare parts.</li>
                    <li>No guarantee or warranty is covered for the handset repairs.</li>
                    <li>Customer is advised to check the device at the time of delivery itself.</li>
                    <li>After delivery no claims will be entertained.</li>
                </ul>
            </div>

            <div class="signature-section">
                <div class="signature-row">
                    <div class="signature-box">
                        <div class="signature-label">Customer</div>
                        <div class="signature-line"></div>
                        <div class="signature-name">I acknowledge terms</div>
                    </div>
                    <div class="signature-box">
                        <div class="signature-label">PhoneCare</div>
                        <div class="signature-line"></div>
                        <div class="signature-name">Authorized Rep.</div>
                    </div>
                </div>
            </div>
            
            <div class="receipt-footer">
                <div class="footer-line bold">PHONECARE</div>
                <div class="footer-line">Track Status: myphonecare.info</div>
                <div class="footer-line bold">Keep this receipt safe for device collection</div>
            </div>
        </div>
    `;
}

// Generate dual receipt for printing
function generateDualReceiptHTML(device) {
    const currentDate = new Date().toLocaleDateString('en-IN');
    const currentTime = new Date().toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    const receiptContent = `
        <div class="receipt-header">
            <div class="shop-name">PHONECARE</div>
            <div class="shop-tagline">SHOP NO 27, Mahanadi Complex, Niharika, Korba</div>
            <div class="shop-contact">Ph: +91 9202424973 (Technician) | myphonecare.info</div>
            <div class="receipt-type">{{COPY_TYPE}}</div>
        </div>

        <div class="ticket-info">
            <div class="ticket-left">
                <div class="ticket-id">Tracking Code: ${device.ticketId}</div>
                <div class="ticket-copy">Visit <b>myphonecare.info</b> and track your repairing status</div>
            </div>
            <div class="ticket-right">
                <div class="ticket-date">${currentDate} ${currentTime}</div>
            </div>
        </div>

        <div class="device-info-section">
            <div class="section-title">Device Information</div>
            <div class="detail-row">
                <span class="detail-label">Customer:</span>
                <span class="detail-value">${device.customerName}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Mobile:</span>
                <span class="detail-value">${device.customerMobile}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Email:</span>
                <span class="detail-value">${device.customerEmail || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Device:</span>
                <span class="detail-value">${device.deviceBrand} ${device.deviceModel}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Problem:</span>
                <span class="detail-value">${device.deviceProblem}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Priority:</span>
                <span class="detail-value">${device.priority}</span>
            </div>
            <div class="detail-row" style="border-top: 1px solid #333; padding-top: 1px; margin-top: 2px;">
                <span class="detail-label">Estimated Cost(may vary*):</span>
                <span class="detail-value amount">Rs.${device.estimatedCost.toLocaleString('en-IN')}</span>
            </div>
        </div>
        
        <div class="barcode-section">
            <div class="barcode-title">TRACKING CODE</div>
            <div id="{{BARCODE_ID}}" class="compact-barcode-container"></div>
        </div>

        <div class="terms-conditions">
            <div class="terms-title">Terms & Conditions | Device Handling Policies</div>
            <ul class="terms-list">
                <li>We (PHONECARE) reserve the right to refuse service to anyone.</li>
                <li>We (PHONECARE) or any technician under us, is NOT responsible if equipment is damaged,water damaged, data damaged or broken during the event of testing/repairing/servicing.</li>
                <li>The delivery data indicated in the receipt is approximate and may vary as per nature of repair and availability of spare parts.</li>
                <li>No guarantee or warranty is covered for the handset repairs.</li>
                <li>Customer is advised to check the device at the time of delivery itself.</li>
                <li>After delivery no claims will be entertained.</li>
            </ul>
        </div>

        <div class="signature-section">
            <div class="signature-row">
                <div class="signature-box">
                    <div class="signature-label">Customer</div>
                    <div class="signature-line"></div>
                    <div class="signature-name">I acknowledge terms</div>
                </div>
                <div class="signature-box">
                    <div class="signature-label">Technician</div>
                    <div class="signature-line"></div>
                    <div class="signature-name">Authorized Rep.</div>
                </div>
            </div>
        </div>
        
        <div class="receipt-footer">
            <div class="footer-line bold">PHONECARE</div>
            <div class="footer-line">Track Status: myphonecare.info</div>
            <div class="footer-line bold">Keep this receipt safe for device collection</div>
        </div>
    `;
    
    return `
        <div class="dual-receipt">
            <div class="receipt-copy">
                ${receiptContent.replace('{{COPY_TYPE}}', 'CUSTOMER COPY').replace('{{BARCODE_ID}}', 'barcode1')}
            </div>
            <div class="receipt-copy">
                ${receiptContent.replace('{{COPY_TYPE}}', 'STORE COPY').replace('{{BARCODE_ID}}', 'barcode2')}
            </div>
        </div>
    `;
}

// Print receipt
function printReceipt() {
    if (!registryState.currentDevice) return;
    
    const printableArea = document.getElementById('printableArea');
    printableArea.innerHTML = generateDualReceiptHTML(registryState.currentDevice);
    
    // Generate barcodes for both copies
    setTimeout(() => {
        generateBarcode(registryState.currentDevice.ticketId, 'barcode1');
        generateBarcode(registryState.currentDevice.ticketId, 'barcode2');
        
        // Print after barcodes are generated
        setTimeout(() => {
            window.print();
        }, 500);
    }, 100);
    
    closeModal('receiptModal');
}

// Generate barcode
function generateBarcode(ticketId, containerId) {
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

// Export data to CSV
function exportToCSV() {
    if (registryState.filteredDevices.length === 0) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    const headers = [
        'Ticket ID',
        'Customer Name',
        'Mobile',
        'Email',
        'Device Brand',
        'Device Model',
        'Problem',
        'Priority',
        'Status',
        'Estimated Cost',
        'Final Amount',
        'Payment Status',
        'Registered Date',
        'Updated Date'
    ];
    
    const csvData = registryState.filteredDevices.map(device => {
        const createdDate = device.createdAt 
            ? (device.createdAt.toDate ? device.createdAt.toDate() : new Date(device.createdAt))
            : new Date();
        
        const updatedDate = device.updatedAt 
            ? (device.updatedAt.toDate ? device.updatedAt.toDate() : new Date(device.updatedAt))
            : createdDate;
        
        return [
            device.ticketId || '',
            device.customerName || '',
            device.customerMobile || '',
            device.customerEmail || '',
            device.deviceBrand || '',
            device.deviceModel || '',
            device.deviceProblem || '',
            device.priority || '',
            device.status || '',
            device.estimatedCost || 0,
            device.finalAmount || '',
            device.paymentStatus || '',
            createdDate.toLocaleDateString('en-IN'),
            updatedDate.toLocaleDateString('en-IN')
        ];
    });
    
    const csvContent = [headers, ...csvData]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `device_registry_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification(`Exported ${registryState.filteredDevices.length} devices to CSV`, 'success');
}

// Refresh registry data
async function refreshRegistry() {
    const btn = document.getElementById('refreshRegistry');
    const originalHTML = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    
    await loadAllRegisteredDevices();
    
    setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }, 1000);
}

// Utility functions
function findDeviceById(deviceId) {
    return registryState.allDevices.find(device => device.id === deviceId);
}

function showLoading(show) {
    const loadingState = document.getElementById('loadingState');
    const registryTableContainer = document.getElementById('registryTableContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (show) {
        loadingState.style.display = 'flex';
        registryTableContainer.style.display = 'none';
        emptyState.style.display = 'none';
    } else {
        loadingState.style.display = 'none';
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Modal functions
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
    document.body.style.overflow = 'auto';
}

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

// Navigation function
function goBack() {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        // If no history, redirect to main dashboard
        window.location.href = 'index.html'; // Adjust path as needed
    }
}
// Admin configuration - Store this securely in production
const ADMIN_CONFIG = {
    password: "phonecare2565", // Change this to your desired admin password
    maxAttempts: 3,
    lockoutTime: 5 * 60 * 1000 // 5 minutes lockout
};

// Admin auth state
let adminAuthState = {
    attempts: 0,
    lockedUntil: null,
    pendingDeleteId: null,
    isAuthenticated: false,
    sessionExpiry: null
};

// Check if admin is locked out
function isAdminLockedOut() {
    if (adminAuthState.lockedUntil && Date.now() < adminAuthState.lockedUntil) {
        return true;
    }
    if (adminAuthState.lockedUntil && Date.now() >= adminAuthState.lockedUntil) {
        // Reset lockout
        adminAuthState.lockedUntil = null;
        adminAuthState.attempts = 0;
    }
    return false;
}

// Get remaining lockout time in minutes
function getRemainingLockoutTime() {
    if (!adminAuthState.lockedUntil) return 0;
    const remaining = Math.ceil((adminAuthState.lockedUntil - Date.now()) / (1000 * 60));
    return Math.max(0, remaining);
}

// Make functions globally available
window.viewDeviceDetails = viewDeviceDetails;
window.printDeviceReceipt = printDeviceReceipt;
window.printFromDetails = printFromDetails;
window.printReceipt = printReceipt;
window.exportToCSV = exportToCSV;
window.clearFilters = clearFilters;
window.applyFilters = applyFilters;
window.closeModal = closeModal;
window.goBack = goBack;
window.confirmDeleteDevice = confirmDeleteDevice;