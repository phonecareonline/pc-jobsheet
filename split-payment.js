
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
    document.getElementById('confirmPayment').addEventListener('click', handlePaymentConfirmation);
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
    if (!currentProcessingDevice) {
        showNotification('No device selected for payment', 'error');
        return;
    }

    const paymentMode = document.querySelector('input[name="paymentMode"]:checked').value;
    
    if (paymentMode === 'single') {
        await processSinglePayment();
    } else {
        await processSplitPayment();
    }
}

async function processSinglePayment() {
    const finalAmount = document.getElementById('finalAmount').value;
    const paymentMethod = document.getElementById('paymentMethod').value;
    const paymentNotes = document.getElementById('paymentNotes').value;
    
    // Validation
    if (!finalAmount || parseFloat(finalAmount) <= 0) {
        showNotification('Please enter a valid payment amount', 'error');
        document.getElementById('finalAmount').focus();
        return;
    }
    
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
            finalPaymentAmount: parseFloat(finalAmount),
            paymentMethod: paymentMethod,
            paymentNotes: paymentNotes,
            paymentType: 'single',
            paymentCollectedDate: Timestamp.now(),
            updatedAt: Timestamp.now()
        };
        
        await updateDoc(deviceRef, paymentData);
        
        // Create payment log entry
        await addDoc(collection(db, 'payment_logs'), {
            ticketId: currentProcessingDevice.ticketId,
            customerName: currentProcessingDevice.customerName,
            deviceInfo: `${currentProcessingDevice.deviceBrand} ${currentProcessingDevice.deviceModel}`,
            amount: parseFloat(finalAmount),
            method: paymentMethod,
            type: 'single_payment',
            timestamp: Timestamp.now(),
            deviceId: currentProcessingDevice.id,
            notes: paymentNotes
        });
        
        closeModal('paymentModal');
        showNotification(`Payment of ₹${finalAmount} collected via ${getPaymentMethodName(paymentMethod)}!`, 'success');
        
        resetPaymentModal();
        await loadTodayRevenue();
        await loadAllDevices();
        
    } catch (error) {
        console.error('Error processing single payment:', error);
        showNotification('Failed to process payment', 'error');
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

function resetPaymentModal() {
    // Reset single payment fields
    document.getElementById('finalAmount').value = '';
    document.getElementById('paymentMethod').value = '';
    document.getElementById('paymentNotes').value = '';
    
    // Reset split payment fields
    clearSplitPayments();
    
    // Reset payment mode selection
    document.querySelector('input[name="paymentMode"][value="single"]').checked = true;
    document.getElementById('singlePaymentSection').style.display = 'block';
    document.getElementById('splitPaymentSection').style.display = 'none';
    
    currentProcessingDevice = null;
}

// Make functions globally available
window.removeSplitPaymentRow = removeSplitPaymentRow;
window.resetPaymentModal = resetPaymentModal;
window.handlePaymentConfirmation = handlePaymentConfirmation;
