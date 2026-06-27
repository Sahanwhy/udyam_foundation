/* ══════════════════════════════════════════
   UDYAM SOCIAL DEVELOPMENT FOUNDATION
   Interactions — script.js
══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ─── PRELOADER ────────────────────────────────────────────
  const preloader = document.getElementById('preloader');
  if (preloader) {
    window.addEventListener('load', () => {
      // Add a slight artificial delay so the logo is fully visible
      setTimeout(() => {
        preloader.classList.add('is-loaded');
        setTimeout(() => preloader.remove(), 1200);
      }, 600);
    });
  }

  // ─── NAVBAR: Scroll behaviour ─────────────────────────────
  const navbar = document.getElementById('navbar');

  function handleNavbarScroll() {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }
  window.addEventListener('scroll', handleNavbarScroll, { passive: true });
  handleNavbarScroll(); // run once on load


  // ─── NAVBAR: Active link on scroll ────────────────────────
  const sections  = document.querySelectorAll('section[id]');
  const navLinks  = document.querySelectorAll('.nav-link');

  function setActiveLink() {
    const scrollY = window.scrollY + 100;
    sections.forEach(section => {
      if (scrollY >= section.offsetTop && scrollY < section.offsetTop + section.offsetHeight) {
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === '#' + section.id);
        });
      }
    });
  }
  window.addEventListener('scroll', setActiveLink, { passive: true });


  // ─── HAMBURGER MENU ───────────────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const navLinksEl = document.getElementById('navLinks');

  hamburger.addEventListener('click', () => {
    const isOpen = navLinksEl.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close menu when a link is clicked
  navLinksEl.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinksEl.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  // Close menu on outside click
  document.addEventListener('click', (e) => {
    if (!navbar.contains(e.target) && navLinksEl.classList.contains('open')) {
      navLinksEl.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  });


  // ─── SCROLL REVEAL ────────────────────────────────────────
  const revealEls = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          // Stagger siblings in the same parent
          const siblings = [...entry.target.parentElement.querySelectorAll('.reveal')];
          const idx = siblings.indexOf(entry.target);
          setTimeout(() => {
            entry.target.classList.add('visible');
          }, idx * 100);
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  revealEls.forEach(el => revealObserver.observe(el));


  // ─── COUNTER ANIMATION (Hero stats) ───────────────────────
  const counters = document.querySelectorAll('.stat-num[data-target]');

  function animateCounter(el) {
    const target  = parseInt(el.dataset.target, 10);
    const duration = 1800;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed  = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased    = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  const heroObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          counters.forEach(animateCounter);
          heroObserver.disconnect();
        }
      });
    },
    { threshold: 0.5 }
  );

  const heroStats = document.querySelector('.hero-stats');
  if (heroStats) heroObserver.observe(heroStats);


  // ─── VOLUNTEER FORM VALIDATION & SUBMISSION ───────────────
  const volunteerSubmit = document.getElementById('volunteerSubmit');
  const formSuccess     = document.getElementById('formSuccess');

  if (volunteerSubmit) {
    volunteerSubmit.addEventListener('click', () => {
      const fullName  = document.getElementById('fullName');
      const phone     = document.getElementById('phone');
      const email     = document.getElementById('email');
      const helpType  = document.getElementById('helpType');

      // Clear previous errors
      [fullName, phone, email, helpType].forEach(clearError);

      let hasError = false;

      if (!fullName.value.trim()) {
        showError(fullName, 'Please enter your full name.');
        hasError = true;
      }
      if (!phone.value.trim() || phone.value.trim().replace(/\D/g,'').length < 10) {
        showError(phone, 'Please enter a valid 10-digit number.');
        hasError = true;
      }
      if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
        showError(email, 'Please enter a valid email address.');
        hasError = true;
      }
      if (!helpType.value) {
        showError(helpType, "Please select how you'd like to help.");
        hasError = true;
      }

      if (hasError) return;

      // Success state
      volunteerSubmit.disabled   = true;
      volunteerSubmit.textContent = 'Submitting…';

      // Simulate async submission
      setTimeout(() => {
        volunteerSubmit.style.display = 'none';
        formSuccess.classList.add('show');
        // Reset after 6s
        setTimeout(() => {
          [fullName, phone, email, document.getElementById('status'), helpType].forEach(el => {
            el.value = el.tagName === 'SELECT' ? '' : '';
          });
          volunteerSubmit.style.display  = '';
          volunteerSubmit.disabled       = false;
          volunteerSubmit.textContent    = 'Register as Volunteer';
          formSuccess.classList.remove('show');
        }, 6000);
      }, 900);
    });
  }

  function showError(el, message) {
    el.style.borderColor = '#EF4444';
    el.style.boxShadow   = '0 0 0 3px rgba(239,68,68,0.12)';

    const existing = el.parentElement.querySelector('.field-error');
    if (!existing) {
      const err = document.createElement('span');
      err.className   = 'field-error';
      err.textContent = message;
      err.style.cssText = 'font-size:0.75rem;color:#EF4444;display:block;margin-top:0.3rem;font-family:var(--font-label,sans-serif)';
      el.parentElement.appendChild(err);
    }
  }

  function clearError(el) {
    el.style.borderColor = '';
    el.style.boxShadow   = '';
    const err = el.parentElement.querySelector('.field-error');
    if (err) err.remove();
  }

  // Clear error on input
  ['fullName','phone','email','helpType'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => clearError(el));
  });


  // ─── DONATE AMOUNT SELECTOR ───────────────────────────────
  const amountBtns = document.querySelectorAll('.amount-btn');
  amountBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      amountBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });


  // ─── PAGE TRANSITION SCROLL ───────────────────
  const pageTransition = document.getElementById('pageTransition');

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();

      if (pageTransition && pageTransition.classList.contains('is-active')) return;

      // Close mobile menu if open
      if (navLinksEl && navLinksEl.classList.contains('open')) {
        navLinksEl.classList.remove('open');
        if (hamburger) {
          hamburger.classList.remove('open');
          hamburger.setAttribute('aria-expanded', 'false');
        }
        document.body.style.overflow = '';
      }

      if (pageTransition) {
        // Start Wipe In
        pageTransition.classList.add('is-active', 'is-animating-in');

        // Wait for Wipe In to finish (800ms + 100ms delay = 900ms)
        setTimeout(() => {
          // Jump to section
          const navHeight = navbar ? navbar.offsetHeight : 0;
          const top = target.getBoundingClientRect().top + window.scrollY - navHeight;
          window.scrollTo({ top, behavior: 'auto' });

          // Start Wipe Out
          pageTransition.classList.remove('is-animating-in');
          pageTransition.classList.add('is-animating-out');

          // Wait for Wipe Out to finish
          setTimeout(() => {
            pageTransition.classList.remove('is-active', 'is-animating-out');
          }, 900);
        }, 900);
      } else {
        // Fallback if no transition element
        const navHeight = navbar ? navbar.offsetHeight : 0;
        const top = target.getBoundingClientRect().top + window.scrollY - navHeight;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });


  // ─── PROGRAM BLOCKS: Micro hover accent ───────────────────
  document.querySelectorAll('.program-block').forEach(block => {
    block.addEventListener('mouseenter', () => {
      block.style.transform = 'translateY(-4px)';
    });
    block.addEventListener('mouseleave', () => {
      block.style.transform = '';
    });
  });

  // ─── DONATE PAGE FORM LOGIC ───────────────────────────────
  const donAmountInput = document.getElementById('donAmount');
  const amountSelectBtns = document.querySelectorAll('.amount-select-btn');
  
  if (donAmountInput) {
    amountSelectBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        amountSelectBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        donAmountInput.value = btn.dataset.amount;
        clearError(donAmountInput);
      });
    });

    donAmountInput.addEventListener('input', () => {
      amountSelectBtns.forEach(b => b.classList.remove('active'));
    });
  }

  const donateSubmitBtn = document.getElementById('donateSubmitBtn');
  if (donateSubmitBtn) {
    donateSubmitBtn.addEventListener('click', () => {
      const fName = document.getElementById('donFullName');
      const phone = document.getElementById('donPhone');
      const email = document.getElementById('donEmail');
      const address = document.getElementById('donAddress');
      const amount = document.getElementById('donAmount');

      [fName, phone, email, address, amount].forEach(clearError);
      let hasErr = false;

      if (!fName.value.trim()) { showError(fName, 'Please enter your full name.'); hasErr = true; }
      if (!phone.value.trim() || phone.value.replace(/\D/g,'').length < 10) { showError(phone, 'Valid 10-digit number required.'); hasErr = true; }
      if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { showError(email, 'Valid email required.'); hasErr = true; }
      if (!address.value.trim()) { showError(address, 'Please enter your address.'); hasErr = true; }
      if (!amount.value || amount.value < 1) { showError(amount, 'Please select or enter a valid amount.'); hasErr = true; }

      if (hasErr) return;

      donateSubmitBtn.disabled = true;
      donateSubmitBtn.textContent = 'Processing...';

      const amountInPaise = amount.value * 100;

      fetch('http://localhost:3000/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountInPaise })
      })
      .then(res => res.json())
      .then(order => {
        if (!order || !order.id) {
          throw new Error('Order creation failed');
        }
        
        const options = {
          key: 'rzp_live_T6WpzWVVSdMVDS', // KEY_ID is safe on frontend
          amount: order.amount,
          currency: order.currency,
          name: 'Udyam Foundation',
          description: 'Donation',
          order_id: order.id,
          prefill: {
            name: fName.value,
            email: email.value,
            contact: phone.value
          },
          handler: function (response) {
            // Verify payment
            fetch('http://localhost:3000/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            })
            .then(res => res.json())
            .then(data => {
              if (data.success) {
                donateSubmitBtn.style.display = 'none';
                const successMsg = document.getElementById('donateSuccess');
                if(successMsg) {
                  successMsg.textContent = '💚 Payment Successful! Thank you for your donation.';
                  successMsg.classList.add('show');
                }
              } else {
                alert('Payment verification failed!');
                donateSubmitBtn.disabled = false;
                donateSubmitBtn.textContent = 'Proceed to Payment';
              }
            })
            .catch(err => {
              console.error(err);
              alert('Verification error. Please contact support.');
              donateSubmitBtn.disabled = false;
              donateSubmitBtn.textContent = 'Proceed to Payment';
            });
          },
          modal: {
            ondismiss: function() {
              donateSubmitBtn.disabled = false;
              donateSubmitBtn.textContent = 'Proceed to Payment';
            }
          }
        };

        const rzp = new window.Razorpay(options);
        
        rzp.on('payment.failed', function (response){
          alert('Payment Failed: ' + response.error.description);
          donateSubmitBtn.disabled = false;
          donateSubmitBtn.textContent = 'Proceed to Payment';
        });

        rzp.open();
      })
      .catch(err => {
        console.error(err);
        alert('Failed to initialize payment. Please check if the server is running.');
        donateSubmitBtn.disabled = false;
        donateSubmitBtn.textContent = 'Proceed to Payment';
      });
    });

    ['donFullName', 'donPhone', 'donEmail', 'donAddress', 'donAmount'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.addEventListener('input', () => clearError(el));
    });
  }

});
