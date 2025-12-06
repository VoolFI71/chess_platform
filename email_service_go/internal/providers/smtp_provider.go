package providers

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// SMTPProvider реализация EmailProvider для SMTP
type SMTPProvider struct {
	Host      string
	Port      int
	User      string
	Password  string
	FromEmail string
	FromName  string
	UseTLS    bool // true для порта 465 (SSL), false для 587 (STARTTLS)
}

// NewSMTPProvider создаёт новый SMTP провайдер
func NewSMTPProvider(host string, port int, user, password, fromEmail, fromName string) *SMTPProvider {
	// Для порта 465 используется TLS, для 587 - STARTTLS
	useTLS := port == 465

	return &SMTPProvider{
		Host:      host,
		Port:      port,
		User:      user,
		Password:  password,
		FromEmail: fromEmail,
		FromName:  fromName,
		UseTLS:    useTLS,
	}
}

// Validate проверяет конфигурацию SMTP провайдера
func (s *SMTPProvider) Validate() error {
	if s.Host == "" {
		return fmt.Errorf("SMTP host is required")
	}
	if s.Port <= 0 || s.Port > 65535 {
		return fmt.Errorf("invalid SMTP port: %d", s.Port)
	}
	if s.User == "" {
		return fmt.Errorf("SMTP user is required")
	}
	if s.Password == "" {
		return fmt.Errorf("SMTP password is required")
	}
	if s.FromEmail == "" {
		return fmt.Errorf("SMTP from email is required")
	}
	return nil
}

// SendEmail отправляет email через SMTP
func (s *SMTPProvider) SendEmail(ctx context.Context, to, subject, bodyHTML, bodyText string) error {
	if err := s.Validate(); err != nil {
		return fmt.Errorf("invalid SMTP configuration: %w", err)
	}

	// Формируем адрес сервера (используем net.JoinHostPort для поддержки IPv6)
	addr := net.JoinHostPort(s.Host, fmt.Sprintf("%d", s.Port))

	// Формируем заголовки письма
	// Mail.ru требует, чтобы заголовок From совпадал с адресом аутентификации (User)
	// Поэтому используем User в заголовке From, а не FromEmail
	headers := make(map[string]string)
	headers["From"] = fmt.Sprintf("%s <%s>", s.FromName, s.User)
	headers["To"] = to
	headers["Subject"] = subject
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = "text/html; charset=UTF-8"

	// Формируем тело письма
	message := ""
	for k, v := range headers {
		message += fmt.Sprintf("%s: %s\r\n", k, v)
	}
	message += "\r\n" + bodyHTML

	// Создаём auth
	auth := smtp.PlainAuth("", s.User, s.Password, s.Host)

	var conn net.Conn
	var err error

	// Подключаемся к SMTP серверу
	if s.UseTLS {
		// Для порта 465 (SSL) используем TLS сразу
		tlsConfig := &tls.Config{
			ServerName: s.Host,
		}
		conn, err = tls.DialWithDialer(
			&net.Dialer{Timeout: 10 * time.Second},
			"tcp",
			addr,
			tlsConfig,
		)
		if err != nil {
			return fmt.Errorf("failed to connect to SMTP server: %w", err)
		}
		defer conn.Close()

		// Создаём SMTP клиент поверх TLS соединения
		client, err := smtp.NewClient(conn, s.Host)
		if err != nil {
			return fmt.Errorf("failed to create SMTP client: %w", err)
		}
		defer client.Quit()

		// Авторизуемся
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP authentication failed: %w", err)
		}

		// Отправляем письмо
		// Используем User (адрес аутентификации) как адрес отправителя для команды Mail(),
		// так как многие SMTP серверы требуют совпадения адреса отправителя с адресом аутентификации
		// FromEmail используется только в заголовке письма
		if err := client.Mail(s.User); err != nil {
			return fmt.Errorf("failed to set sender: %w", err)
		}
		if err := client.Rcpt(to); err != nil {
			return fmt.Errorf("failed to set recipient: %w", err)
		}

		writer, err := client.Data()
		if err != nil {
			return fmt.Errorf("failed to open data connection: %w", err)
		}

		_, err = writer.Write([]byte(message))
		if err != nil {
			writer.Close()
			return fmt.Errorf("failed to write message: %w", err)
		}

		if err := writer.Close(); err != nil {
			return fmt.Errorf("failed to close data connection: %w", err)
		}
	} else {
		// Для порта 587 используем STARTTLS
		conn, err = net.DialTimeout("tcp", addr, 10*time.Second)
		if err != nil {
			return fmt.Errorf("failed to connect to SMTP server: %w", err)
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, s.Host)
		if err != nil {
			return fmt.Errorf("failed to create SMTP client: %w", err)
		}
		defer client.Quit()

		// Проверяем поддержку STARTTLS
		if ok, _ := client.Extension("STARTTLS"); ok {
			tlsConfig := &tls.Config{
				ServerName: s.Host,
			}
			if err := client.StartTLS(tlsConfig); err != nil {
				return fmt.Errorf("failed to start TLS: %w", err)
			}
		}

		// Авторизуемся
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP authentication failed: %w", err)
		}

		// Отправляем письмо
		// Используем User (адрес аутентификации) как адрес отправителя для команды Mail(),
		// так как многие SMTP серверы требуют совпадения адреса отправителя с адресом аутентификации
		// FromEmail используется только в заголовке письма
		if err := client.Mail(s.User); err != nil {
			return fmt.Errorf("failed to set sender: %w", err)
		}
		if err := client.Rcpt(to); err != nil {
			return fmt.Errorf("failed to set recipient: %w", err)
		}

		writer, err := client.Data()
		if err != nil {
			return fmt.Errorf("failed to open data connection: %w", err)
		}

		_, err = writer.Write([]byte(message))
		if err != nil {
			writer.Close()
			return fmt.Errorf("failed to write message: %w", err)
		}

		if err := writer.Close(); err != nil {
			return fmt.Errorf("failed to close data connection: %w", err)
		}
	}

	return nil
}

// sanitizeEmail очищает email адрес от лишних символов
func sanitizeEmail(email string) string {
	return strings.TrimSpace(strings.ToLower(email))
}
