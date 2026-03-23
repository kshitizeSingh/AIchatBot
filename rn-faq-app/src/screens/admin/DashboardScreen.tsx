// src/screens/admin/DashboardScreen.tsx
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SDKContext } from '../../contexts/SDKContext';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';
import { useAuth } from '../../hooks/useAuth';

interface DashboardStats {
  totalDocuments: number;
  totalUsers: number;
  totalConversations: number;
  recentDocuments: any[];
  recentUsers: any[];
}

const DashboardScreen: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalDocuments: 0,
    totalUsers: 0,
    totalConversations: 0,
    recentDocuments: [],
    recentUsers: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const sdk = useContext(SDKContext);
  const { logout } = useAuth();

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load documents
      const documents = await sdk.getDocuments();
      
      // Load users (admin function)
      const users = await sdk.getUsers();
      
      // Load conversations
      const conversations = await sdk.getConversations();

      setStats({
        totalDocuments: documents.length,
        totalUsers: users.length,
        totalConversations: conversations.length,
        recentDocuments: documents.slice(0, 5),
        recentUsers: users.slice(0, 5),
      });
    } catch (error: any) {
      console.error('Dashboard error:', error);
      Alert.alert('Error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: logout },
      ]
    );
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  if (loading) {
    return <Loading text="Loading dashboard..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Admin Dashboard</Text>
          <Button
            title="Logout"
            onPress={handleLogout}
            variant="outline"
            style={styles.logoutButton}
          />
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.totalDocuments}</Text>
            <Text style={styles.statLabel}>Documents</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.totalUsers}</Text>
            <Text style={styles.statLabel}>Users</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.totalConversations}</Text>
            <Text style={styles.statLabel}>Conversations</Text>
          </View>
        </View>

        {/* Recent Documents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Documents</Text>
          {stats.recentDocuments.length > 0 ? (
            stats.recentDocuments.map((doc, index) => (
              <View key={index} style={styles.listItem}>
                <Text style={styles.itemTitle}>{doc.filename || 'Untitled'}</Text>
                <Text style={styles.itemSubtitle}>
                  Status: {doc.status || 'Unknown'}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No documents found</Text>
          )}
        </View>

        {/* Recent Users */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Users</Text>
          {stats.recentUsers.length > 0 ? (
            stats.recentUsers.map((user, index) => (
              <View key={index} style={styles.listItem}>
                <Text style={styles.itemTitle}>{user.email || 'Unknown'}</Text>
                <Text style={styles.itemSubtitle}>
                  Role: {user.role || 'User'}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No users found</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 36,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    backgroundColor: '#fff',
    marginTop: 10,
  },
  statCard: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    minWidth: 80,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 10,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  listItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  itemSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default DashboardScreen;