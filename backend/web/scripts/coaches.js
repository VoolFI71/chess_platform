// Coaches page functionality

/**
 * Handle booking form submission
 */
function handleBookingSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Basic validation
    if (!data.name || !data.phone) {
        alert('Пожалуйста, заполните обязательные поля');
        return;
    }
    
    if (!data.consent) {
        alert('Необходимо согласие на обработку персональных данных');
        return;
    }
    
    // Here you would typically send the data to your backend API
    // For now, we'll just show a success message
    console.log('Booking form data:', data);
    
    // Show success message
    alert('Спасибо за заявку! Мы свяжемся с вами в ближайшее время.');
    
    // Reset form
    form.reset();
    
    // Optional: Send to Telegram/Email/API
    // sendBookingRequest(data);
}

/**
 * Open booking modal (if needed in the future)
 */
function openBookingModal(coachName) {
    // For now, scroll to the booking form
    const bookingForm = document.getElementById('booking-form');
    if (bookingForm) {
        bookingForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Optional: Pre-fill coach name if there's a field for it
        // const coachField = document.getElementById('booking-coach');
        // if (coachField) {
        //     coachField.value = coachName;
        // }
    }
}

/**
 * Send booking request to backend (placeholder)
 */
async function sendBookingRequest(data) {
    try {
        const response = await fetch('/api/coaches/booking', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        
        if (!response.ok) {
            throw new Error('Failed to send booking request');
        }
        
        const result = await response.json();
        console.log('Booking request sent:', result);
        return result;
    } catch (error) {
        console.error('Error sending booking request:', error);
        throw error;
    }
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href && href.length > 1) {
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    });
    
    // Initialize booking form
    const bookingForm = document.getElementById('coachBookingForm');
    if (bookingForm) {
        bookingForm.addEventListener('submit', handleBookingSubmit);
    }
});
