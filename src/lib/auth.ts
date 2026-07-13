// 認証ヘッダー判定。
// nginx の auth_request（auth-app /auth/check）が返す X-Auth-Role を nginx が
// proxy_set_header で転送してくる前提。クライアントが直接付けたヘッダーは
// nginx の proxy_set_header で上書きされるため信用できる。
// ヘッダー欠落・admin 以外は拒否（fail-closed）。
export function isAdminHeaders(headers: Headers): boolean {
  return headers.get('x-auth-role') === 'admin'
}
