// Form utilities - общая логика для обработки форм
(() => {
  'use strict';

  /**
   * Находит форму по селектору или событию
   * @param {Event|string|HTMLElement} source - Событие, селектор или элемент
   * @param {string} [modalId] - ID модального окна
   * @param {string} [formName] - Имя формы
   * @returns {HTMLFormElement|null} - Найденная форма или null
   */
  function findForm(source, modalId, formName) {
    if (source instanceof HTMLFormElement) {
      return source;
    }

    if (source && source.target) {
      return source.target.closest('form');
    }

    if (typeof source === 'string') {
      return document.querySelector(source);
    }

    if (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) {
        return modal.querySelector('form') || modal.querySelector(`[data-form="${formName}"]`);
      }
    }

    if (formName) {
      return document.querySelector(`form[name="${formName}"]`) ||
             document.querySelector(`[data-form="${formName}"]`);
    }

    return null;
  }

  /**
   * Получает данные формы
   * @param {HTMLFormElement} form - Форма
   * @returns {Object} - Объект с данными формы
   */
  function getFormData(form) {
    if (!form) return {};

    const formData = new FormData(form);
    const data = {};

    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    return data;
  }

  /**
   * Валидирует форму
   * @param {HTMLFormElement} form - Форма
   * @param {Object} rules - Правила валидации { fieldName: { required: boolean, validator: Function } }
   * @returns {Object} - { valid: boolean, errors: Object }
   */
  function validateForm(form, rules = {}) {
    const errors = {};
    const data = getFormData(form);

    for (const [fieldName, rule] of Object.entries(rules)) {
      const value = data[fieldName];
      const field = form.querySelector(`[name="${fieldName}"]`);

      if (rule.required && (!value || (typeof value === 'string' && !value.trim()))) {
        errors[fieldName] = rule.message || `Поле "${fieldName}" обязательно для заполнения`;
        if (field) {
          field.classList.add('error');
        }
      } else if (rule.validator && typeof rule.validator === 'function') {
        const error = rule.validator(value, data);
        if (error) {
          errors[fieldName] = error;
          if (field) {
            field.classList.add('error');
          }
        }
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  /**
   * Устанавливает состояние загрузки формы
   * @param {HTMLFormElement} form - Форма
   * @param {boolean} isLoading - Состояние загрузки
   * @param {string} [loadingText] - Текст при загрузке
   */
  function setFormLoading(form, isLoading, loadingText) {
    if (!form) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    if (!submitBtn) return;

    if (isLoading) {
      if (!submitBtn.dataset.originalContent) {
        submitBtn.dataset.originalContent = submitBtn.innerHTML;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = '';
      if (loadingText) {
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        spinner.setAttribute('aria-hidden', 'true');
        const textSpan = document.createElement('span');
        textSpan.textContent = loadingText;
        submitBtn.appendChild(spinner);
        submitBtn.appendChild(textSpan);
      }
    } else {
      submitBtn.disabled = false;
      if (submitBtn.dataset.originalContent) {
        submitBtn.innerHTML = submitBtn.dataset.originalContent;
      }
    }
  }

  /**
   * Показывает сообщение об ошибке/успехе в форме
   * @param {HTMLFormElement} form - Форма
   * @param {string} message - Сообщение
   * @param {string} [type='error'] - Тип сообщения ('error' | 'success')
   */
  function showFormFeedback(form, message, type = 'error') {
    if (!form) return;

    // Удаляем предыдущие сообщения
    const existingFeedback = form.querySelector('.form-feedback');
    if (existingFeedback) {
      existingFeedback.remove();
    }

    const feedback = document.createElement('div');
    feedback.className = `form-feedback ${type}`;
    feedback.textContent = message;
    form.insertBefore(feedback, form.firstChild);

    // Автоматически скрываем через 5 секунд
    setTimeout(() => {
      if (feedback.parentElement) {
        feedback.remove();
      }
    }, 5000);
  }

  /**
   * Очищает сообщения об ошибках в форме
   * @param {HTMLFormElement} form - Форма
   */
  function clearFormFeedback(form) {
    if (!form) return;

    const feedback = form.querySelector('.form-feedback');
    if (feedback) {
      feedback.remove();
    }

    // Убираем классы ошибок с полей
    form.querySelectorAll('.error').forEach((field) => {
      field.classList.remove('error');
    });
  }

  /**
   * Создает обработчик отправки формы с валидацией и обработкой ошибок
   * @param {HTMLFormElement} form - Форма
   * @param {Function} onSubmit - Функция обработки отправки (async function(formData) { ... })
   * @param {Object} [validationRules] - Правила валидации
   * @returns {Function} - Обработчик события submit
   */
  function createFormSubmitHandler(form, onSubmit, validationRules = {}) {
    return async (event) => {
      if (event && event.preventDefault) {
        event.preventDefault();
      }

      clearFormFeedback(form);

      // Валидация
      if (Object.keys(validationRules).length > 0) {
        const validation = validateForm(form, validationRules);
        if (!validation.valid) {
          const firstError = Object.values(validation.errors)[0];
          showFormFeedback(form, firstError, 'error');
          return;
        }
      }

      const formData = getFormData(form);
      setFormLoading(form, true);

      try {
        await onSubmit(formData, form);
      } catch (error) {
        showFormFeedback(form, error.message || 'Произошла ошибка', 'error');
      } finally {
        setFormLoading(form, false);
      }
    };
  }

  // Export
  window.FormUtils = {
    findForm,
    getFormData,
    validateForm,
    setFormLoading,
    showFormFeedback,
    clearFormFeedback,
    createFormSubmitHandler,
  };
})();
