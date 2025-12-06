package providers

import "context"

// EmailProvider интерфейс для отправки email через различные провайдеры
type EmailProvider interface {
	// SendEmail отправляет email
	SendEmail(ctx context.Context, to, subject, bodyHTML, bodyText string) error

	// Validate проверяет конфигурацию провайдера
	Validate() error
}
