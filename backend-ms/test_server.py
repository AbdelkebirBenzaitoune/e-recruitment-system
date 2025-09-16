from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/api/formations/test', methods=['GET'])
def test_formations():
    return jsonify({"message": "Test endpoint OK", "status": "working"})

@app.route('/api/formations/recommend', methods=['POST'])
def recommend_formations():
    return jsonify({
        "success": True,
        "message": "Endpoint formations/recommend fonctionne",
        "recommendations": {
            "user_name": "Test User",
            "priority_skills": ["Python", "JavaScript"],
            "formations": [
                {
                    "title": "Python pour débutants",
                    "provider": "Test Academy",
                    "duration": "4 semaines",
                    "level": "Débutant"
                }
            ]
        }
    })

@app.route('/api/debug/routes', methods=['GET'])
def debug_routes():
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            "endpoint": rule.endpoint,
            "methods": list(rule.methods),
            "rule": str(rule)
        })
    return jsonify({"routes": routes})

if __name__ == '__main__':
    print("🚀 Test server démarré sur port 3002")
    app.run(debug=True, host='0.0.0.0', port=3002)