package media

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/google/uuid"
)

type R2Service struct {
	client     *s3.Client
	bucketName string
	endpoint   string
	publicURL  string
}

var r2Service *R2Service

// R2Config holds the configuration for R2
type R2Config struct {
	AccessKeyID     string
	SecretAccessKey string
	BucketName      string
	AccountID       string
	Endpoint        string
	PublicURL        string
	Region          string
}

// UploadResult represents the result of a file upload
type UploadResult struct {
	URL      string `json:"url"`
	Key      string `json:"key"`
	FileName string `json:"fileName"`
	FileSize int64  `json:"fileSize"`
	MimeType string `json:"mimeType"`
}

func InitializeR2() error {
	cfg := R2Config{
		AccessKeyID:     os.Getenv("R2_ACCESS_KEY_ID"),
		SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
		BucketName:      os.Getenv("R2_BUCKET_NAME"),
		AccountID:       os.Getenv("R2_ACCOUNT_ID"),
		Endpoint:        os.Getenv("R2_ENDPOINT"),
		PublicURL:        os.Getenv("R2_PUBLIC_URL"),
		Region:          os.Getenv("R2_REGION"),
	}

	// Set defaults
	if cfg.Region == "" {
		cfg.Region = "auto"
	}
	if cfg.Endpoint == "" {
		cfg.Endpoint = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", cfg.AccountID)
	}

	// Validate required fields
	if cfg.AccessKeyID == "" || cfg.SecretAccessKey == "" || cfg.BucketName == "" || cfg.AccountID == "" {
		return fmt.Errorf("missing required R2 configuration: ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET_NAME, and ACCOUNT_ID are required")
	}

	// Create AWS config
	awsConfig, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion(cfg.Region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.AccessKeyID,
			cfg.SecretAccessKey,
			"",
		)),
	)
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	// Create S3 client with custom endpoint
	client := s3.NewFromConfig(awsConfig, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.Endpoint)
	})

	r2Service = &R2Service{
		client:     client,
		bucketName: cfg.BucketName,
		endpoint:   cfg.Endpoint,
		publicURL:  cfg.PublicURL,
	}

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err = client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(cfg.BucketName),
	})
	if err != nil {
		return fmt.Errorf("failed to connect to R2 bucket: %w", err)
	}

	log.Println("R2 initialized successfully")
	return nil
}

func GetR2Service() *R2Service {
	if r2Service == nil {
		panic("R2 service not initialized. Call InitializeR2() first")
	}
	return r2Service
}

func IsR2Available() bool {
	return r2Service != nil
}

func (r *R2Service) UploadFile(ctx context.Context, file multipart.File, header *multipart.FileHeader, folder string) (*UploadResult, error) {
	// Read file content
	fileContent, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	// Reset file pointer
	file.Seek(0, 0)

	// Generate unique filename
	ext := filepath.Ext(header.Filename)
	filename := fmt.Sprintf("%s%s", uuid.New().String(), ext)

	// Create key with folder if provided
	key := filename
	if folder != "" {
		key = fmt.Sprintf("%s/%s", strings.Trim(folder, "/"), filename)
	}

	// Detect content type
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = http.DetectContentType(fileContent)
	}

	// Upload to R2
	_, err = r.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(r.bucketName),
		Key:         aws.String(key),
		Body:        bytes.NewReader(fileContent),
		ContentType: aws.String(contentType),
		ACL:         types.ObjectCannedACLPublicRead,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to upload file to R2: %w", err)
	}

	// Generate public URL
	publicURL := r.getPublicURL(key)

	return &UploadResult{
		URL:      publicURL,
		Key:      key,
		FileName: header.Filename,
		FileSize: header.Size,
		MimeType: contentType,
	}, nil
}

func (r *R2Service) DeleteFile(ctx context.Context, key string) error {
	_, err := r.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(r.bucketName),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("failed to delete file from R2: %w", err)
	}
	return nil
}

func (r *R2Service) DeleteFileByURL(ctx context.Context, url string) error {
	key := r.extractKeyFromURL(url)
	if key == "" {
		return fmt.Errorf("invalid URL: cannot extract key")
	}
	return r.DeleteFile(ctx, key)
}

// getPublicURL generates the public URL for a file
func (r *R2Service) getPublicURL(key string) string {
	if r.publicURL != "" {
		return fmt.Sprintf("%s/%s", strings.TrimRight(r.publicURL, "/"), key)
	}
	// Fallback to default R2 public URL format
	return fmt.Sprintf("https://%s.r2.dev/%s", r.bucketName, key)
}

// extractKeyFromURL extracts the key from a public URL
func (r *R2Service) extractKeyFromURL(url string) string {
	if r.publicURL != "" {
		prefix := strings.TrimRight(r.publicURL, "/") + "/"
		if strings.HasPrefix(url, prefix) {
			return strings.TrimPrefix(url, prefix)
		}
	}

	// Try default R2 format
	prefix := fmt.Sprintf("https://%s.r2.dev/", r.bucketName)
	if strings.HasPrefix(url, prefix) {
		return strings.TrimPrefix(url, prefix)
	}

	return ""
}

// Convenience functions

func UploadFile(ctx context.Context, file multipart.File, header *multipart.FileHeader, folder string) (*UploadResult, error) {
	return GetR2Service().UploadFile(ctx, file, header, folder)
}

func DeleteFile(ctx context.Context, key string) error {
	return GetR2Service().DeleteFile(ctx, key)
}

func DeleteFileByURL(ctx context.Context, url string) error {
	return GetR2Service().DeleteFileByURL(ctx, url)
}
