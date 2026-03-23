// src/screens/admin/UserManagementScreen.tsx
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SDKContext } from '../../contexts/SDKContext';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';

interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  createdAt: string;
  lastLoginAt?: string;
}

const UserManagementScreen: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const sdk = useContext(SDKContext);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const userList = await sdk.getUsers();
      setUsers(userList);
    } catch (error: any) {
      console.error('Users error:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  };

  const handlePromoteUser = async (userId: string, userEmail: string) => {
    Alert.alert(
      'Promote User',
      `Are you sure you want to promote "${userEmail}" to admin?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Promote',
          onPress: async () => {
            try {
              await sdk.promoteUserToAdmin(userId);
              setUsers(prev =>
                prev.map(user =>
                  user.id === userId ? { ...user, role: 'admin' } : user
                )
              );
              Alert.alert('Success', 'User promoted to admin successfully');
            } catch (error: any) {
              Alert.alert('Error', 'Failed to promote user');
            }
          },
        },
      ]
    );
  };

  const handleRevokeAccess = async (userId: string, userEmail: string) => {
    Alert.alert(
      'Revoke Access',
      `Are you sure you want to revoke access for "${userEmail}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await sdk.revokeUserAccess(userId);
              setUsers(prev =>
                prev.map(user =>
                  user.id === userId ? { ...user, status: 'inactive' } : user
                )
              );
              Alert.alert('Success', 'User access revoked successfully');
            } catch (error: any) {
              Alert.alert('Error', 'Failed to revoke user access');
            }
          },
        },
      ]
    );
  };

  const getRoleColor = (role: string) => {
    return role === 'admin' ? '#007AFF' : '#34C759';
  };

  const getStatusColor = (status: string) => {
    return status === 'active' ? '#34C759' : '#FF3B30';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const renderUser = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      <View style={styles.userHeader}>
        <View style={styles.userInfo}>
          <Text style={styles.userEmail} numberOfLines={1}>
            {item.email}
          </Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: getRoleColor(item.role) }]}>
              <Text style={styles.badgeText}>{item.role.toUpperCase()}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) }]}>
              <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.userDetails}>
        <Text style={styles.detailText}>Joined: {formatDate(item.createdAt)}</Text>
        <Text style={styles.detailText}>Last Login: {formatDate(item.lastLoginAt)}</Text>
      </View>

      <View style={styles.userActions}>
        {item.role === 'user' && item.status === 'active' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.promoteButton]}
            onPress={() => handlePromoteUser(item.id, item.email)}
          >
            <Text style={styles.promoteButtonText}>Promote to Admin</Text>
          </TouchableOpacity>
        )}
        
        {item.status === 'active' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.revokeButton]}
            onPress={() => handleRevokeAccess(item.id, item.email)}
          >
            <Text style={styles.revokeButtonText}>Revoke Access</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  useEffect(() => {
    loadUsers();
  }, []);

  if (loading) {
    return <Loading text="Loading users..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>User Management</Text>
        <Text style={styles.subtitle}>{users.length} total users</Text>
      </View>

      {users.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Users Found</Text>
          <Text style={styles.emptySubtitle}>
            Users will appear here once they register
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  list: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  userDetails: {
    marginBottom: 16,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    flex: 1,
    minWidth: 120,
  },
  promoteButton: {
    backgroundColor: '#007AFF',
  },
  promoteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  revokeButton: {
    backgroundColor: '#FF3B30',
  },
  revokeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default UserManagementScreen;