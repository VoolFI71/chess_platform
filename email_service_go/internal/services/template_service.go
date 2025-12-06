package services

import (
	"bytes"
	"fmt"
	"html/template"
	"path/filepath"
)

// TemplateService управляет HTML шаблонами для email
type TemplateService struct {
	templatesDir string
}

// NewTemplateService создаёт новый сервис шаблонов
func NewTemplateService(templatesDir string) *TemplateService {
	return &TemplateService{
		templatesDir: templatesDir,
	}
}

// WelcomeEmailData данные для приветственного письма
type WelcomeEmailData struct {
	Username          string
	VerificationToken string
	FrontendURL       string
}

// PasswordResetEmailData данные для письма восстановления пароля
type PasswordResetEmailData struct {
	Username          string
	ResetToken        string
	ExpiresAt         string
	FrontendURL       string
	ResetPasswordPath string
}

// RenderWelcomeEmail генерирует HTML для приветственного письма
func (ts *TemplateService) RenderWelcomeEmail(data WelcomeEmailData) (string, error) {
	tmplPath := filepath.Join(ts.templatesDir, "welcome.html")
	tmpl, err := template.ParseFiles(tmplPath)
	if err != nil {
		return "", fmt.Errorf("failed to parse welcome template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("failed to execute welcome template: %w", err)
	}

	return buf.String(), nil
}

// RenderPasswordResetEmail генерирует HTML для письма восстановления пароля
func (ts *TemplateService) RenderPasswordResetEmail(data PasswordResetEmailData) (string, error) {
	tmplPath := filepath.Join(ts.templatesDir, "password_reset.html")
	tmpl, err := template.ParseFiles(tmplPath)
	if err != nil {
		return "", fmt.Errorf("failed to parse password reset template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("failed to execute password reset template: %w", err)
	}

	return buf.String(), nil
}

// VerificationCodeEmailData данные для письма с кодом верификации
type VerificationCodeEmailData struct {
	Username  string
	Code      string
	Purpose   string
	ExpiresIn int // в минутах
}

// RenderVerificationCodeEmail генерирует HTML для письма с кодом верификации
func (ts *TemplateService) RenderVerificationCodeEmail(data VerificationCodeEmailData) (string, error) {
	tmplPath := filepath.Join(ts.templatesDir, "verification_code.html")
	tmpl, err := template.ParseFiles(tmplPath)
	if err != nil {
		return "", fmt.Errorf("failed to parse verification code template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("failed to execute verification code template: %w", err)
	}

	return buf.String(), nil
}
