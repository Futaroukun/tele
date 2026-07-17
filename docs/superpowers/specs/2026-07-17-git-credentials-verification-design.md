# Design Spec: Git Credentials Verification Flow

This document details the design for verifying the validity of GitHub credentials (username and token) using the official GitHub API before saving them to the SQLite database.

## 1. Credentials Verification Logic
A new function `verifyGitHubCredentials(username, token)` will be created. It performs a GET request to the GitHub user profile endpoint (`https://api.github.com/user`) using the provided token.

* **Success State (HTTP 200):**
  * The API returns the profile details including the `login` username.
  * If the returned `login` matches the user-provided username (case-insensitive):
    * Validation succeeds.
    * Credentials are saved to the database.
  * If the returned `login` does **not** match the user-provided username:
    * Validation fails.
    * Inform the user: `❌ Validasi Gagal: Username tidak cocok. Anda menginput "<input_user>", sedangkan token ini terdaftar atas nama akun "@<real_user>".`
* **Error State (HTTP 401/403):**
  * Inform the user: `❌ Validasi Gagal: Token Personal Access Token (PAT) salah atau sudah kedaluwarsa.`
* **Network Error State:**
  * Inform the user: `❌ Validasi Gagal: Gagal terhubung ke GitHub (Masalah Jaringan/Koneksi Internet).`

## 2. Interactive Flow Integration
During the confirmation step of the credential collection wizard:
1. Owner inputs credentials.
2. Owner types `YA` to confirm.
3. Bot replies with: `⏳ Sedang memverifikasi akun Anda ke GitHub...`
4. Bot executes `verifyGitHubCredentials`.
5. If success, save to database and reply success.
6. If failure, print the specific failure reason and abort saving (reset the wizard session so they can re-enter).
