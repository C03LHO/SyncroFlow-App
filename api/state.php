<?php
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/hydrate.php';

$u = require_login();
$teamId = isset($_GET['team']) ? (string)$_GET['team'] : null;
json_out(build_initial_state($u, $teamId));
