package services

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/yourorg/email_service_go/internal/config"
	"github.com/yourorg/email_service_go/internal/providers"
)

// EmailService бизнес-логика отправки email
type EmailService struct {
	provider        providers.EmailProvider
	templateService *TemplateService
	cfg             *config.Config
}

// NewEmailService создаёт новый email сервис
func NewEmailService(cfg *config.Config) (*EmailService, error) {
	// Инициализация провайдера
	var provider providers.EmailProvider

	switch cfg.EmailProvider {
	case "smtp":
		provider = providers.NewSMTPProvider(
			cfg.SMTPHost,
			cfg.SMTPPort,
			cfg.SMTPUser,
			cfg.SMTPPassword,
			cfg.SMTPFromEmail,
			cfg.SMTPFromName,
		)
	default:
		return nil, fmt.Errorf("unsupported email provider: %s", cfg.EmailProvider)
	}

	// Валидация провайдера
	if err := provider.Validate(); err != nil {
		return nil, fmt.Errorf("email provider validation failed: %w", err)
	}

	// Определяем путь к шаблонам
	// В Docker: /root/templates (из Dockerfile), локально: ./internal/templates
	templatesDir := "./internal/templates"
	if templatesEnv := os.Getenv("TEMPLATES_DIR"); templatesEnv != "" {
		templatesDir = templatesEnv
		log.Printf("Using templates directory from TEMPLATES_DIR env: %s", templatesDir)
	} else if _, err := os.Stat("/root/templates"); err == nil {
		// Если запущено в Docker и шаблоны в /root/templates
		templatesDir = "/root/templates"
		log.Printf("Using Docker templates directory: %s", templatesDir)
	} else {
		log.Printf("Using default templates directory: %s", templatesDir)
	}

	// Инициализация сервиса шаблонов
	templateService := NewTemplateService(templatesDir)

	return &EmailService{
		provider:        provider,
		templateService: templateService,
		cfg:             cfg,
	}, nil
}

// SendWelcomeEmail отправляет приветственное письмо
func (es *EmailService) SendWelcomeEmail(ctx context.Context, email, username, verificationToken string) error {
	// Генерация HTML из шаблона
	html, err := es.templateService.RenderWelcomeEmail(WelcomeEmailData{
		Username:          username,
		VerificationToken: verificationToken,
		FrontendURL:       es.cfg.FrontendURL,
	})
	if err != nil {
		return fmt.Errorf("failed to render welcome email template: %w", err)
	}

	// Генерируем простой текстовый вариант
	text := fmt.Sprintf(
		"Добро пожаловать, %s!\n\nСпасибо за регистрацию в Power Chess.\n\n"+
			"Ваш аккаунт успешно создан. Начните решать задачи, играть партии и улучшать свои навыки!",
		username,
	)

	// Отправка email
	subject := "Добро пожаловать в Power Chess!"
	if err := es.provider.SendEmail(ctx, email, subject, html, text); err != nil {
		log.Printf("Failed to send welcome email to %s: %v", email, err)
		return fmt.Errorf("failed to send welcome email: %w", err)
	}

	log.Printf("Welcome email sent successfully to %s", email)
	return nil
}

// SendPasswordResetEmail отправляет письмо для восстановления пароля
func (es *EmailService) SendPasswordResetEmail(ctx context.Context, email, username, resetToken, expiresAt string) error {
	// Генерация HTML из шаблона
	html, err := es.templateService.RenderPasswordResetEmail(PasswordResetEmailData{
		Username:          username,
		ResetToken:        resetToken,
		ExpiresAt:         expiresAt,
		FrontendURL:       es.cfg.FrontendURL,
		ResetPasswordPath: es.cfg.FrontendResetPasswordPath,
	})
	if err != nil {
		return fmt.Errorf("failed to render password reset email template: %w", err)
	}

	// Генерируем простой текстовый вариант
	text := fmt.Sprintf(
		"Восстановление пароля\n\n"+
			"Здравствуйте, %s!\n\n"+
			"Вы запросили восстановление пароля для вашего аккаунта Power Chess.\n\n"+
			"Ссылка для восстановления: %s%s?token=%s\n\n"+
			"Ссылка действительна до %s.\n\n"+
			"Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.",
		username,
		es.cfg.FrontendURL,
		es.cfg.FrontendResetPasswordPath,
		resetToken,
		expiresAt,
	)

	// Отправка email
	subject := "Восстановление пароля Power Chess"
	if err := es.provider.SendEmail(ctx, email, subject, html, text); err != nil {
		log.Printf("Failed to send password reset email to %s: %v", email, err)
		return fmt.Errorf("failed to send password reset email: %w", err)
	}

	log.Printf("Password reset email sent successfully to %s", email)
	return nil
}

// SendVerificationCodeEmail отправляет письмо с кодом верификации
func (es *EmailService) SendVerificationCodeEmail(ctx context.Context, email, username, code, purpose string, expiresInMinutes int) error {
	// Используем тип VerificationCodeEmailData из template_service (тот же пакет)
	html, err := es.templateService.RenderVerificationCodeEmail(VerificationCodeEmailData{
		Username:  username,
		Code:      code,
		Purpose:   purpose,
		ExpiresIn: expiresInMinutes,
	})
	if err != nil {
		return fmt.Errorf("failed to render verification code email template: %w", err)
	}

	// Генерируем простой текстовый вариант
	text := fmt.Sprintf(
		"Код подтверждения\n\n"+
			"Здравствуйте, %s!\n\n"+
			"%s\n\n"+
			"Ваш код подтверждения: %s\n\n"+
			"Код действителен в течение %d минут.\n\n"+
			"Никому не сообщайте этот код. Если вы не запрашивали этот код, проигнорируйте это письмо.",
		username,
		purpose,
		code,
		expiresInMinutes,
	)

	// Отправка email
	subject := "Код подтверждения Power Chess"
	if err := es.provider.SendEmail(ctx, email, subject, html, text); err != nil {
		log.Printf("Failed to send verification code email to %s: %v", email, err)
		return fmt.Errorf("failed to send verification code email: %w", err)
	}

	log.Printf("Verification code email sent successfully to %s", email)
	return nil
}

// SetTemplatesDir устанавливает путь к директории с шаблонами (для тестирования или Docker)
func (es *EmailService) SetTemplatesDir(dir string) {
	es.templateService = NewTemplateService(dir)
}
