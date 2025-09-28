// Enhanced Reports JavaScript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import { getFirestore, collection, query, where, getDocs, orderBy, Timestamp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';

// Verify firebaseConfig
if (!window.firebaseConfig) {
    console.error('Firebase configuration not found. Ensure firebase-config.js is loaded.');
    showNotification('Firebase configuration error. Please check console.', 'error');
    throw new Error('Firebase configuration not found');
}

// Initialize Firebase
const app = initializeApp(window.firebaseConfig);
const db = getFirestore(app);

// Enhanced Global state
let reportsData = {
    handovered: [],
    returned: [],
    payments: [],
    summary: {
        totalRevenue: 0,
        cashRevenue: 0,
        onlineRevenue: 0,
        cardRevenue: 0,
        totalHandovers: 0,
        totalReturns: 0,
        totalPartsCost: 0,
        grossProfit: 0,
        normalPriorityHandovers: 0,
        urgentPriorityHandovers: 0,
        nonRepairableReturns: 0,
        otherReturns: 0,
        serviceRevenue: 0,
        partsRevenue: 0,
        profitMargin: 0,
        averageTicketValue: 0,
        successRate: 0
    }
};

// Helper function to safely update elements
function safeUpdateElement(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
    } else {
        console.warn(`Element '${elementId}' not found in DOM`);
    }
}

// Initialize reports page
document.addEventListener('DOMContentLoaded', function() {
    initializeReportsPage();
    setupEventListeners();
    loadReportsData();
    
    // Auto-refresh every 5 minutes
    setInterval(loadReportsData, 300000);
});

// Initialize the reports page
function initializeReportsPage() {
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    const reportDateElement = document.getElementById('reportDate');
    if (reportDateElement) {
        reportDateElement.value = today;
    }
    
    // Update current time
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    // Update report ated time and data range
    safeUpdateElement('reportGeneratedTime', new Date().toLocaleString('en-IN'));
    safeUpdateElement('dataRange', `${today} (Today)`);
    
    console.log('📋 Enhanced Reports page initialized');
}

// Setup all event listeners
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Date change
    const reportDate = document.getElementById('reportDate');
    if (reportDate) {
        reportDate.addEventListener('change', handleDateChange);
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshReports');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            showNotification('Refreshing reports data...', 'info');
            loadReportsData();
        });
    }
    
    // Export buttons
    const exportButtons = [
        { id: 'exportHandovered', type: 'handovered' },
        { id: 'exportReturned', type: 'returned' },
        { id: 'exportPayments', type: 'payments' },
        { id: 'exportAccounting', type: 'full' }
    ];
    
    exportButtons.forEach(({ id, type }) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => exportToCSV(type));
        }
    });
    
    // Print buttons
    const printButtons = [
        { id: 'printHandovered', section: 'handovered' },
        { id: 'printReturned', section: 'returned' },
        { id: 'printPayments', section: 'payments' },
        { id: 'printAccounting', section: 'accounting' }
    ];
    
    printButtons.forEach(({ id, section }) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => printReport(section));
        }
    });
    
    // Back to dashboard
    const backBtn = document.getElementById('backToDashboard');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }
}

// Handle date change with validation
function handleDateChange() {
    const selectedDate = document.getElementById('reportDate').value;
    if (selectedDate) {
        const date = new Date(selectedDate);
        const today = new Date();
        
        if (date > today) {
            showNotification('Cannot select future dates', 'error');
            document.getElementById('reportDate').value = today.toISOString().split('T')[0];
            return;
        }
        
        safeUpdateElement('dataRange', `${selectedDate} (Selected Date)`);
        showNotification('Loading data for selected date...', 'info');
        loadReportsData();
    }
}

// Update current time display
function updateCurrentTime() {
    const now = new Date();
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Kolkata'
    };
    safeUpdateElement('currentDateTime', now.toLocaleDateString('en-IN', options));
}

// Switch between tabs with enhanced animations
function switchTab(tabName) {
    console.log(`🔄 Switching to ${tabName} tab`);
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.opacity = '0';
    });
    
    const activeTab = document.getElementById(`${tabName}Tab`);
    if (activeTab) {
        activeTab.classList.add('active');
        setTimeout(() => {
            activeTab.style.opacity = '1';
        }, 100);
    }
    
    updateTabCounts();
}

async function loadReportsData() {
    try {
        console.log('📊 Starting to load reports data...');
        showLoadingState();
        
        // Get selected date or use today
        const reportDate = document.getElementById('reportDate');
        const selectedDate = reportDate ? reportDate.value : new Date().toISOString().split('T')[0];
        
        // Calculate date range for the selected day
        const startDate = new Date(selectedDate);
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);
        
        console.log('📅 Date range:', { startDate, endDate });
        
        // Load all data concurrently
        const [paymentDataWithSplits] = await Promise.all([
            loadPaymentDataWithSplits(startDate, endDate),
            loadHandoveredDevices(startDate, endDate),
            loadReturnedDevices(startDate, endDate),
            loadPaymentDetails(startDate, endDate)
        ]);
        
        console.log('💰 Payment data loaded:', paymentDataWithSplits);
        
        // Calculate summary from loaded data
        calculateSummaryData();
        
        // Update summary with split payment data
        updateSummaryWithSplitData(paymentDataWithSplits);
        
        // Update all displays
        updateAllDisplays();
        
        // Display revenue breakdown
        displayRevenueBreakdown({
            total: paymentDataWithSplits.total.amount,
            cash: paymentDataWithSplits.cash.amount,
            upi: paymentDataWithSplits.upi.amount,
            card: paymentDataWithSplits.card.amount,
            transactionCount: paymentDataWithSplits.total.count,
            breakdown: paymentDataWithSplits
        });
        
        console.log('✅ Reports data loaded successfully');
        showNotification('Reports data loaded successfully', 'success');
        
    } catch (error) {
        console.error('❌ Error loading reports data:', error);
        showErrorState('Failed to load reports data');
        showNotification('Failed to load reports data', 'error');
    }
}
function updateSummaryWithSplitData(paymentData) {
    // Update the summary object with split payment data
    reportsData.summary.cashRevenue = paymentData.cash.amount;
    reportsData.summary.onlineRevenue = paymentData.upi.amount;
    reportsData.summary.cardRevenue = paymentData.card.amount;
    reportsData.summary.totalRevenue = paymentData.total.amount;
    
    console.log('🔄 Updated summary with split data:', {
        cash: reportsData.summary.cashRevenue,
        online: reportsData.summary.onlineRevenue,
        card: reportsData.summary.cardRevenue,
        total: reportsData.summary.totalRevenue
    });
}
// Load handovered devices
async function loadHandoveredDevices(startDate, endDate) {
    try {
        const q = query(
            collection(db, 'repair_tickets'),
            where('status', '==', 'Payment Collected'),
            where('paymentCollectedDate', '>=', Timestamp.fromDate(startDate)),
            where('paymentCollectedDate', '<', Timestamp.fromDate(endDate)),
            orderBy('paymentCollectedDate', 'desc')
        );
        
        const snapshot = await getDocs(q);
        reportsData.handovered = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log(`Fetched ${reportsData.handovered.length} handovered devices`);
    } catch (error) {
        console.error('Error loading handovered devices:', error);
        reportsData.handovered = [];
        showNotification('Failed to load handovered devices', 'error');
    }
}

// Load returned devices
async function loadReturnedDevices(startDate, endDate) {
    try {
        const q = query(
            collection(db, 'repair_tickets'),
            where('status', '==', 'Returned'),
            where('returnDate', '>=', Timestamp.fromDate(startDate)),
            where('returnDate', '<', Timestamp.fromDate(endDate)),
            orderBy('returnDate', 'desc')
        );
        
        const snapshot = await getDocs(q);
        reportsData.returned = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log(`Fetched ${reportsData.returned.length} returned devices`);
    } catch (error) {
        console.error('Error loading returned devices:', error);
        reportsData.returned = [];
        showNotification('Failed to load returned devices', 'error');
    }
}

// Load payment details
async function loadPaymentDetails(startDate, endDate) {
    try {
        const q = query(
            collection(db, 'repair_tickets'),
            where('status', '==', 'Payment Collected'),
            where('paymentCollectedDate', '>=', Timestamp.fromDate(startDate)),
            where('paymentCollectedDate', '<', Timestamp.fromDate(endDate)),
            orderBy('paymentCollectedDate', 'desc')
        );
        
        const snapshot = await getDocs(q);
        reportsData.payments = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log(`Fetched ${reportsData.payments.length} payments`);
    } catch (error) {
        console.error('Error loading payment details:', error);
        reportsData.payments = [];
        showNotification('Failed to load payment details', 'error');
    }
}

// Calculate enhanced summary data
// Enhanced calculate summary data with debugging
function calculateSummaryData() {
    console.log('🧮 Calculating summary data...');
    console.log('Raw data - Handovered:', reportsData.handovered.length, 'Returned:', reportsData.returned.length);
    
    const summary = reportsData.summary;
    
    // Reset summary
    Object.keys(summary).forEach(key => summary[key] = 0);
    
    // Calculate handovers
    summary.totalHandovers = reportsData.handovered.length;
    
    reportsData.handovered.forEach((device, index) => {
        console.log(`Processing handover ${index + 1}:`, device);
        
        const amount = device.finalAmount || device.estimatedCost || device.totalCost || 0;
        summary.totalRevenue += amount;
        
        const paymentMethod = (device.paymentMethod || '').toLowerCase();
        console.log(`Payment method: ${paymentMethod}, Amount: ${amount}`);
        
        switch (paymentMethod) {
            case 'cash':
                summary.cashRevenue += amount;
                break;
            case 'online/upi':
            case 'online':
            case 'upi':
                summary.onlineRevenue += amount;
                break;
            case 'card/pos':
            case 'card':
            case 'pos':
                summary.cardRevenue += amount;
                break;
            default:
                console.warn(`Unknown payment method: ${paymentMethod}`);
                summary.cashRevenue += amount; // Default to cash
        }
        
        summary.serviceRevenue += device.serviceCost || 0;
        summary.partsRevenue += device.totalPartsCost || 0;
        summary.totalPartsCost += device.totalPartsCost || 0;
        
        const priority = device.priority || '';
        if (priority.includes('Normal')) {
            summary.normalPriorityHandovers++;
        } else if (priority.includes('Urgent') || priority.includes('High')) {
            summary.urgentPriorityHandovers++;
        }
    });
    
    // Calculate returns
    summary.totalReturns = reportsData.returned.length;
    
    reportsData.returned.forEach(device => {
        const returnReason = (device.returnReason || '').toLowerCase();
        if (returnReason.includes('cannot be repaired') || returnReason.includes('not repairable')) {
            summary.nonRepairableReturns++;
        } else {
            summary.otherReturns++;
        }
    });
    
    // Calculate profit metrics
    summary.grossProfit = summary.totalRevenue - summary.totalPartsCost;
    summary.profitMargin = summary.totalRevenue ? (summary.grossProfit / summary.totalRevenue * 100) : 0;
    summary.averageTicketValue = summary.totalHandovers ? (summary.totalRevenue / summary.totalHandovers) : 0;
    summary.successRate = (summary.totalHandovers + summary.totalReturns) ? 
        (summary.totalHandovers / (summary.totalHandovers + summary.totalReturns) * 100) : 0;
    
    console.log('📊 Calculated summary:', summary);
}


// Update all displays
// Enhanced update all displays function
function updateAllDisplays() {
    console.log('🔄 Updating all displays with data:', reportsData.summary);
    
    // Remove loading state first
    document.querySelectorAll('.summary-card').forEach(card => {
        card.classList.remove('loading');
    });
    
    // Update displays
    updateSummaryCards();
    updateTabCounts();
    updateTables();
    
    console.log('✅ All displays updated');
}

// Update summary cards with enhanced formatting
function updateSummaryCards() {
    const summary = reportsData.summary;
    
    // Main cards
    safeUpdateElement('totalRevenue', `₹${summary.totalRevenue.toLocaleString('en-IN')}`);
    safeUpdateElement('cashRevenue', `₹${summary.cashRevenue.toLocaleString('en-IN')}`);
    safeUpdateElement('onlineRevenue', `₹${(summary.onlineRevenue + summary.cardRevenue).toLocaleString('en-IN')}`);
    safeUpdateElement('totalHandovers', summary.totalHandovers);
    safeUpdateElement('normalPriorityHandovers', summary.normalPriorityHandovers);
    safeUpdateElement('urgentPriorityHandovers', summary.urgentPriorityHandovers);
    safeUpdateElement('totalReturns', summary.totalReturns);
    safeUpdateElement('nonRepairableReturns', summary.nonRepairableReturns);
    safeUpdateElement('otherReturns', summary.otherReturns);
    safeUpdateElement('grossProfit', `₹${summary.grossProfit.toLocaleString('en-IN')}`);
    safeUpdateElement('profitMargin', `${summary.profitMargin.toFixed(1)}%`);
    safeUpdateElement('avgTicketValue', `₹${summary.averageTicketValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
    
    // Payment breakdown
    safeUpdateElement('cashRevenue2', `₹${summary.cashRevenue.toLocaleString('en-IN')}`);
    safeUpdateElement('onlineRevenue2', `₹${summary.onlineRevenue.toLocaleString('en-IN')}`);
    safeUpdateElement('cardRevenue', `₹${summary.cardRevenue.toLocaleString('en-IN')}`);
    
    // Accounting summary
    safeUpdateElement('serviceRevenue', `₹${summary.serviceRevenue.toLocaleString('en-IN')}`);
    safeUpdateElement('partsRevenue', `₹${summary.partsRevenue.toLocaleString('en-IN')}`);
    safeUpdateElement('totalRevenueSummary', `₹${summary.totalRevenue.toLocaleString('en-IN')}`);
    safeUpdateElement('partsCost', `₹${summary.totalPartsCost.toLocaleString('en-IN')}`);
    safeUpdateElement('returnLosses', `₹0`);
    safeUpdateElement('totalCosts', `₹${summary.totalPartsCost.toLocaleString('en-IN')}`);
    safeUpdateElement('grossProfitSummary', `₹${summary.grossProfit.toLocaleString('en-IN')}`);
    safeUpdateElement('profitMarginSummary', `${summary.profitMargin.toFixed(1)}%`);
    safeUpdateElement('avgTicketValueSummary', `₹${summary.averageTicketValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
    safeUpdateElement('successfulRepairs', summary.totalHandovers);
    safeUpdateElement('returnedDevices', summary.totalReturns);
    safeUpdateElement('successRate', `${summary.successRate.toFixed(1)}%`);
}

// Update tab counts
function updateTabCounts() {
    safeUpdateElement('handoveredCount', reportsData.handovered.length);
    safeUpdateElement('returnedCount', reportsData.returned.length);
    safeUpdateElement('paymentsCount', reportsData.payments.length);
}

// Update tables with enhanced data display
function updateTables() {
    updateHandoveredTable();
    updateReturnedTable();
    updatePaymentsTable();
}

function updateHandoveredTable() {
    const tbody = document.getElementById('handoveredTable');
    if (!tbody) return;
    
    tbody.innerHTML = reportsData.handovered.length ? 
        reportsData.handovered.map(device => `
            <tr>
                <td><strong>${device.ticketId || device.id}</strong></td>
                <td>
                    <div><strong>${device.customerName || 'N/A'}</strong></div>
                    <div style="font-size: 0.9em; color: #666;">${device.customerPhone || 'N/A'}</div>
                </td>
                <td>
                    <div><strong>${device.deviceBrand || 'N/A'} ${device.deviceModel || ''}</strong></div>
                    <div style="font-size: 0.9em; color: #666;">${device.deviceIssue || device.problemDescription || 'N/A'}</div>
                </td>
                <td>
                    <div>${device.partsUsed ? device.partsUsed.join(', ') : 'Service Only'}</div>
                    ${device.totalPartsCost ? `<div style="font-size: 0.9em; color: #666;">₹${device.totalPartsCost}</div>` : ''}
                </td>
                <td><strong>₹${(device.serviceCost || 0).toLocaleString('en-IN')}</strong></td>
                <td>
                    <span class="payment-method ${(device.paymentMethod || '').toLowerCase()}">${device.paymentMethod || 'N/A'}</span>
                </td>
                <td>${device.paymentCollectedDate ? new Date(device.paymentCollectedDate.seconds * 1000).toLocaleString('en-IN') : 'N/A'}</td>
                <td><strong>₹${(device.finalAmount || device.estimatedCost || 0).toLocaleString('en-IN')}</strong></td>
            </tr>
        `).join('') : 
        '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #718096;">No handovered devices found for selected date</td></tr>';
}

function updateReturnedTable() {
    const tbody = document.getElementById('returnedTable');
    if (!tbody) return;
    
    tbody.innerHTML = reportsData.returned.length ? 
        reportsData.returned.map(device => `
            <tr>
                <td><strong>${device.ticketId || device.id}</strong></td>
                <td>
                    <div><strong>${device.customerName || 'N/A'}</strong></div>
                    <div style="font-size: 0.9em; color: #666;">${device.customerPhone || 'N/A'}</div>
                </td>
                <td>
                    <div><strong>${device.deviceBrand || 'N/A'} ${device.deviceModel || ''}</strong></div>
                </td>
                <td>${device.deviceIssue || device.problemDescription || 'N/A'}</td>
                <td>
                    <span class="return-reason">${device.returnReason || 'Not specified'}</span>
                </td>
                <td>${device.returnDate ? new Date(device.returnDate.seconds * 1000).toLocaleString('en-IN') : 'N/A'}</td>
                <td><span class="status-badge return">No Charge</span></td>
            </tr>
        `).join('') : 
        '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #718096;">No returned devices found for selected date</td></tr>';
}

function updatePaymentsTable() {
    const tbody = document.getElementById('paymentsTable');
    if (!tbody) return;
    
    tbody.innerHTML = reportsData.payments.length ? 
        reportsData.payments.map(device => `
            <tr>
                <td>${device.paymentCollectedDate ? new Date(device.paymentCollectedDate.seconds * 1000).toLocaleTimeString('en-IN') : 'N/A'}</td>
                <td><strong>${device.ticketId || device.id}</strong></td>
                <td>
                    <div><strong>${device.customerName || 'N/A'}</strong></div>
                    <div style="font-size: 0.9em; color: #666;">${device.customerPhone || 'N/A'}</div>
                </td>
                <td><strong>₹${(device.finalAmount || device.estimatedCost || 0).toLocaleString('en-IN')}</strong></td>
                <td><span class="payment-method ${(device.paymentMethod || '').toLowerCase()}">${device.paymentMethod || 'N/A'}</span></td>
                <td>Device Handover</td>
                <td><span class="status-badge success">Completed</span></td>
            </tr>
        `).join('') : 
        '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #718096;">No payment records found for selected date</td></tr>';
}
// Add this function to load and categorize payment data
async function loadPaymentDataWithSplits(startDate, endDate) {
    try {
        console.log('💳 Loading payment data with splits...', { startDate, endDate });
        
        // Validate date parameters
        if (!startDate || !endDate) {
            throw new Error('Start date and end date are required');
        }
        
        // Ensure dates are Date objects
        const start = startDate instanceof Date ? startDate : new Date(startDate);
        const end = endDate instanceof Date ? endDate : new Date(endDate);
        
        console.log('📅 Converted dates:', { start, end });
        
        const paymentsQuery = query(
            collection(db, 'payment_logs'),
            where('timestamp', '>=', Timestamp.fromDate(start)),
            where('timestamp', '<', Timestamp.fromDate(end)),
            orderBy('timestamp', 'desc')
        );
        
        const snapshot = await getDocs(paymentsQuery);
        console.log(`📥 Found ${snapshot.size} payment log entries`);
        
        const paymentData = {
            cash: { amount: 0, count: 0, transactions: [] },
            upi: { amount: 0, count: 0, transactions: [] },
            card: { amount: 0, count: 0, transactions: [] },
            total: { amount: 0, count: 0 }
        };
        
        const processedTickets = new Set();
        let totalProcessed = 0;
        
        snapshot.forEach(doc => {
            const payment = { id: doc.id, ...doc.data() };
            const method = payment.method?.toLowerCase() || 'unknown';
            const amount = parseFloat(payment.amount) || 0;
            
            totalProcessed++;
            console.log(`Processing payment ${totalProcessed}:`, {
                ticketId: payment.ticketId,
                method,
                amount,
                type: payment.type
            });
            
            // Map method names to consistent keys
            let methodKey = method;
            if (method === 'online' || method === 'upi/online') {
                methodKey = 'upi';
            }
            
            // Add to appropriate category if method exists
            if (paymentData[methodKey]) {
                paymentData[methodKey].amount += amount;
                paymentData[methodKey].transactions.push(payment);
                
                // Count transactions properly
                if (payment.type === 'split_payment') {
                    // For split payments, only count unique tickets once per method
                    const ticketMethodKey = `${payment.ticketId}-${methodKey}`;
                    if (!processedTickets.has(ticketMethodKey)) {
                        paymentData[methodKey].count += 1;
                        processedTickets.add(ticketMethodKey);
                    }
                } else {
                    // For single payments, count each transaction
                    paymentData[methodKey].count += 1;
                }
            } else {
                console.warn(`Unknown payment method: ${method}, defaulting to cash`);
                // Default unknown methods to cash
                paymentData.cash.amount += amount;
                paymentData.cash.transactions.push(payment);
                paymentData.cash.count += 1;
            }
            
            // Add to total
            paymentData.total.amount += amount;
        });
        
        // Calculate total unique transactions
        const uniqueTickets = new Set();
        snapshot.forEach(doc => {
            const payment = doc.data();
            if (payment.ticketId) {
                uniqueTickets.add(payment.ticketId);
            }
        });
        
        paymentData.total.count = uniqueTickets.size;
        
        console.log('💰 Payment data processed:', {
            cash: `₹${paymentData.cash.amount} (${paymentData.cash.count} transactions)`,
            upi: `₹${paymentData.upi.amount} (${paymentData.upi.count} transactions)`,
            card: `₹${paymentData.card.amount} (${paymentData.card.count} transactions)`,
            total: `₹${paymentData.total.amount} (${paymentData.total.count} unique tickets)`
        });
        
        return paymentData;
        
    } catch (error) {
        console.error('❌ Error loading payment data with splits:', error);
        
        // Return empty structure on error
        return {
            cash: { amount: 0, count: 0, transactions: [] },
            upi: { amount: 0, count: 0, transactions: [] },
            card: { amount: 0, count: 0, transactions: [] },
            total: { amount: 0, count: 0 }
        };
    }
}
// Update your existing daily revenue function
async function calculateDailyRevenue(date) {
    try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        
        const paymentData = await loadPaymentDataWithSplits(startOfDay, endOfDay);
        
        return {
            total: paymentData.total.amount,
            cash: paymentData.cash.amount,
            upi: paymentData.upi.amount,
            card: paymentData.card.amount,
            transactionCount: paymentData.total.count,
            breakdown: {
                cash: { amount: paymentData.cash.amount, count: paymentData.cash.count },
                upi: { amount: paymentData.upi.amount, count: paymentData.upi.count },
                card: { amount: paymentData.card.amount, count: paymentData.card.count }
            }
        };
        
    } catch (error) {
        console.error('❌ Error calculating daily revenue:', error);
        return {
            total: 0, cash: 0, upi: 0, card: 0, transactionCount: 0,
            breakdown: { 
                cash: { amount: 0, count: 0 }, 
                upi: { amount: 0, count: 0 }, 
                card: { amount: 0, count: 0 } 
            }
        };
    }
}
function displayRevenueBreakdown(revenueData) {
    const container = document.getElementById('revenueBreakdown');
    
    if (!container) {
        console.warn('Revenue breakdown container not found, creating it...');
        // Create container if it doesn't exist
        const newContainer = document.createElement('div');
        newContainer.id = 'revenueBreakdown';
        newContainer.style.marginTop = '2rem';
        
        // Try to find a suitable parent element
        const summarySection = document.querySelector('.summary-section') || 
                              document.querySelector('.tab-content.active') ||
                              document.body;
        summarySection.appendChild(newContainer);
        return displayRevenueBreakdown(revenueData); // Retry
    }
    
    // Avoid division by zero
    const total = revenueData.total || 1;
    
    container.innerHTML = `
        <div class="revenue-summary">
            <div class="revenue-total">
                <h3>Total Revenue: ₹${revenueData.total.toLocaleString('en-IN')}</h3>
                <p>${revenueData.transactionCount} transactions</p>
            </div>
            
            <div class="revenue-breakdown">
                <div class="payment-method-card cash">
                    <div class="method-icon">
                        <i class="fas fa-money-bill-wave"></i>
                    </div>
                    <div class="method-details">
                        <h4>Cash Payments</h4>
                        <div class="amount">₹${revenueData.cash.toLocaleString('en-IN')}</div>
                        <div class="count">${revenueData.breakdown?.cash?.count || 0} transactions</div>
                        <div class="percentage">${total > 0 ? ((revenueData.cash / total) * 100).toFixed(1) : 0}%</div>
                    </div>
                </div>
                
                <div class="payment-method-card upi">
                    <div class="method-icon">
                        <i class="fas fa-mobile-alt"></i>
                    </div>
                    <div class="method-details">
                        <h4>UPI/Online</h4>
                        <div class="amount">₹${revenueData.upi.toLocaleString('en-IN')}</div>
                        <div class="count">${revenueData.breakdown?.upi?.count || 0} transactions</div>
                        <div class="percentage">${total > 0 ? ((revenueData.upi / total) * 100).toFixed(1) : 0}%</div>
                    </div>
                </div>
                
                <div class="payment-method-card card">
                    <div class="method-icon">
                        <i class="fas fa-credit-card"></i>
                    </div>
                    <div class="method-details">
                        <h4>Card/POS</h4>
                        <div class="amount">₹${revenueData.card.toLocaleString('en-IN')}</div>
                        <div class="count">${revenueData.breakdown?.card?.count || 0} transactions</div>
                        <div class="percentage">${total > 0 ? ((revenueData.card / total) * 100).toFixed(1) : 0}%</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    console.log('📊 Revenue breakdown displayed');
}
// Update your existing report generation
async function generatePaymentReport(startDate, endDate) {
    try {
        showLoading('Generating payment report...');
        
        const paymentData = await loadPaymentDataWithSplits(startDate, endDate);
        
        // Generate detailed report
        const reportData = {
            period: `${startDate.toLocaleDateString('en-IN')} - ${endDate.toLocaleDateString('en-IN')}`,
            summary: {
                totalRevenue: paymentData.total.amount,
                totalTransactions: paymentData.total.count,
                averageTransaction: paymentData.total.count > 0 ? 
                    (paymentData.total.amount / paymentData.total.count) : 0
            },
            breakdown: {
                cash: paymentData.cash,
                upi: paymentData.upi,
                card: paymentData.card
            },
            transactions: []
        };
        
        // Combine all transactions and sort by timestamp
        const allTransactions = [
            ...paymentData.cash.transactions,
            ...paymentData.upi.transactions,
            ...paymentData.card.transactions
        ].sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
        
        reportData.transactions = allTransactions;
        
        displayPaymentReport(reportData);
        hideLoading();
        
        return reportData;
        
    } catch (error) {
        console.error('Error generating payment report:', error);
        hideLoading();
        showNotification('Failed to generate payment report', 'error');
    }
}
// Show loading state
// function showLoadingState() {
//     document.querySelectorAll('.summary-card').forEach(card => {
//         card.classList.add('loading');
//     });
    
//     ['handoveredTable', 'returnedTable', 'paymentsTable'].forEach(tableId => {
//         const tbody = document.getElementById(tableId);
//         if (tbody) {
//             tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #718096;"><i class="fas fa-spinner fa-spin"></i> Loading data...</td></tr>';
//         }
//     });
// }

// Show error state
// function showErrorState(message) {
//     document.querySelectorAll('.summary-card').forEach(card => {
//         card.classList.remove('loading');
//     });
    
//     ['handoveredTable', 'returnedTable', 'paymentsTable'].forEach(tableId => {
//         const tbody = document.getElementById(tableId);
//         if (tbody) {
//             tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #e53e3e;"><i class="fas fa-exclamation-triangle"></i> ${message}</td></tr>`;
//         }
//     });
// }

// Enhanced notification system
// function showNotification(message, type = 'info') {
//     const container = document.getElementById('notificationContainer') || document.body;
//     const notification = document.createElement('div');
//     notification.className = `notification ${type}`;
//     notification.style.cssText = `
//         position: fixed;
//         top: 20px;
//         right: 20px;
//         background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#e53e3e' : '#667eea'};
//         color: white;
//         padding: 1rem 1.5rem;
//         border-radius: 8px;
//         box-shadow: 0 4px 20px rgba(0,0,0,0.1);
//         z-index: 10000;
//         animation: slideInRight 0.3s ease;
//         max-width: 300px;
//     `;
//     notification.innerHTML = `
//         <div style="display: flex; align-items: center; gap: 0.5rem;">
//             <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
//             ${message}
//         </div>
//     `;
    
//     container.appendChild(notification);
    
//     setTimeout(() => {
//         notification.remove();
//     }, 5000);
// }

// Export to CSV functionality
function exportToCSV(type) {
    let data, filename;
    
    switch (type) {
        case 'handovered':
            data = reportsData.handovered;
            filename = `handovered_devices_${getCurrentDateString()}.csv`;
            break;
        case 'returned':
            data = reportsData.returned;
            filename = `returned_devices_${getCurrentDateString()}.csv`;
            break;
        case 'payments':
            data = reportsData.payments;
            filename = `payments_${getCurrentDateString()}.csv`;
            break;
        case 'full':
            data = {
                handovered: reportsData.handovered,
                returned: reportsData.returned,
                summary: reportsData.summary
            };
            filename = `full_report_${getCurrentDateString()}.csv`;
            break;
        default:
            return;
    }
    
    // Convert data to CSV
    let csvContent = '';
    
    if (type === 'full') {
        // Create comprehensive report
        csvContent = createFullReportCSV(data);
    } else {
        // Create table-specific CSV
        csvContent = createTableCSV(data, type);
    }
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification(`${filename} downloaded successfully`, 'success');
}

// Create CSV content for tables
function createTableCSV(data, type) {
    if (!data.length) return 'No data available for the selected date.';
    
    let headers = [];
    let rows = [];
    
    switch (type) {
        case 'handovered':
            headers = ['Ticket ID', 'Customer Name', 'Phone', 'Device', 'Issue', 'Parts Used', 'Service Cost', 'Payment Method', 'Handover Time', 'Revenue'];
            rows = data.map(device => [
                device.ticketId || device.id,
                device.customerName || '',
                device.customerPhone || '',
                `${device.deviceBrand || ''} ${device.deviceModel || ''}`.trim(),
                device.deviceIssue || device.problemDescription || '',
                device.partsUsed ? device.partsUsed.join('; ') : 'Service Only',
                device.serviceCost || 0,
                device.paymentMethod || '',
                device.paymentCollectedDate ? new Date(device.paymentCollectedDate.seconds * 1000).toLocaleString('en-IN') : '',
                device.finalAmount || device.estimatedCost || 0
            ]);
            break;
        case 'returned':
            headers = ['Ticket ID', 'Customer Name', 'Phone', 'Device', 'Problem', 'Return Reason', 'Return Time'];
            rows = data.map(device => [
                device.ticketId || device.id,
                device.customerName || '',
                device.customerPhone || '',
                `${device.deviceBrand || ''} ${device.deviceModel || ''}`.trim(),
                device.deviceIssue || device.problemDescription || '',
                device.returnReason || '',
                device.returnDate ? new Date(device.returnDate.seconds * 1000).toLocaleString('en-IN') : ''
            ]);
            break;
        case 'payments':
            headers = ['Time', 'Ticket ID', 'Customer Name', 'Phone', 'Amount', 'Method', 'Type', 'Status'];
            rows = data.map(device => [
                device.paymentCollectedDate ? new Date(device.paymentCollectedDate.seconds * 1000).toLocaleTimeString('en-IN') : '',
                device.ticketId || device.id,
                device.customerName || '',
                device.customerPhone || '',
                device.finalAmount || device.estimatedCost || 0,
                device.paymentMethod || '',
                'Device Handover',
                'Completed'
            ]);
            break;
    }
    
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    return csvContent;
}

// Create comprehensive report CSV
function createFullReportCSV(data) {
    const { summary } = data;
    const date = getCurrentDateString();
    
    let csv = `Phone Care - Daily Report - ${date}\n\n`;
    
    // Summary section
    csv += 'DAILY SUMMARY\n';
    csv += `Total Revenue,₹${summary.totalRevenue.toLocaleString('en-IN')}\n`;
    csv += `Cash Revenue,₹${summary.cashRevenue.toLocaleString('en-IN')}\n`;
    csv += `Digital Revenue,₹${(summary.onlineRevenue + summary.cardRevenue).toLocaleString('en-IN')}\n`;
    csv += `Total Handovers,${summary.totalHandovers}\n`;
    csv += `Total Returns,${summary.totalReturns}\n`;
    csv += `Gross Profit,₹${summary.grossProfit.toLocaleString('en-IN')}\n`;
    csv += `Profit Margin,${summary.profitMargin.toFixed(1)}%\n`;
    csv += `Average Ticket Value,₹${summary.averageTicketValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}\n`;
    csv += `Success Rate,${summary.successRate.toFixed(1)}%\n\n`;
    
    // Add detailed tables
    if (data.handovered.length) {
        csv += 'HANDOVERED DEVICES\n';
        csv += createTableCSV(data.handovered, 'handovered') + '\n\n';
    }
    
    if (data.returned.length) {
        csv += 'RETURNED DEVICES\n';
        csv += createTableCSV(data.returned, 'returned') + '\n\n';
    }
    
    csv += `Report Generated: ${new Date().toLocaleString('en-IN')}\n`;
    
    return csv;
}

// Print functionality
function printReport(section) {
    const printWindow = window.open('', '_blank');
    const currentSection = document.getElementById(`${section}Tab`);
    
    if (!currentSection) return;
    
    const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Phone Care - ${section.charAt(0).toUpperCase() + section.slice(1)} Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
                .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
                .summary-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f5f5f5; font-weight: bold; }
                .no-print { display: none; }
                @media print { .no-print { display: none !important; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Phone Care - Daily Reports</h1>
                <p>Date: ${getCurrentDateString()}</p>
                <p>Generated: ${new Date().toLocaleString('en-IN')}</p>
            </div>
            ${currentSection.innerHTML}
        </body>
        </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

// Utility function to get current date string
function getCurrentDateString() {
    return document.getElementById('reportDate')?.value || new Date().toISOString().split('T')[0];
}

// Global functions
window.loadReportsData = loadReportsData;
window.exportToCSV = exportToCSV;
window.printReport = printReport;

console.log('📋 Enhanced Reports system initialized and ready');
// Add missing notification function
function showNotification(message, type = 'info') {
    console.log(`${type.toUpperCase()}: ${message}`);
    
    // Create notification element if container exists
    let container = document.getElementById('notificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notificationContainer';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000;';
        document.body.appendChild(container);
    }
    
    const notification = document.createElement('div');
    notification.style.cssText = `
        background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#e53e3e' : '#667eea'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        margin-bottom: 0.5rem;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        animation: slideInRight 0.3s ease;
    `;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Add missing loading state functions
function showLoadingState() {
    console.log('📊 Loading reports data...');
    
    // Show loading on summary cards
    document.querySelectorAll('.summary-card').forEach(card => {
        card.classList.add('loading');
    });
    
    // Update tables with loading message
    ['handoveredTable', 'returnedTable', 'paymentsTable'].forEach(tableId => {
        const tbody = document.getElementById(tableId);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #718096;"><i class="fas fa-spinner fa-spin"></i> Loading data...</td></tr>';
        }
    });
}

function showErrorState(message) {
    console.error('❌ Error state:', message);
    
    // Remove loading state
    document.querySelectorAll('.summary-card').forEach(card => {
        card.classList.remove('loading');
    });
    
    // Show error in tables
    ['handoveredTable', 'returnedTable', 'paymentsTable'].forEach(tableId => {
        const tbody = document.getElementById(tableId);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #e53e3e;"><i class="fas fa-exclamation-triangle"></i> ${message}</td></tr>`;
        }
    });
}
